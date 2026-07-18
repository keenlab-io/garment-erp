import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  invoice,
  payment,
  receiptTaxInvoice,
  whtCertificate,
  type Db,
} from "@erp/db";
import { formatMoney, toDecimal } from "@erp/utils";
import type {
  InvoiceStatus,
  Payment as PaymentDto,
  RecordPaymentRequest,
  ReceiptTaxInvoice as ReceiptDto,
  ReceiptType,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import {
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { SequenceService } from "../sequence/sequence.service.js";
import { SALES_EVENTS, type PaymentReceivedPayload } from "./sales.events.js";
import { toPaymentDto, toReceiptDto } from "./sales.util.js";

/** Invoice statuses that can accept a payment. */
const PAYABLE: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  "ISSUED",
  "PARTIALLY_PAID",
  "OVERDUE",
]);

/**
 * Payments (task 5.5, spec §5.5). Recording a payment appends a `payment` row, advances
 * `amount_paid`, and re-derives the status: `amount_paid ≥ grand − wht` → **PAID**, else
 * **PARTIALLY_PAID**. The **first** payment issues a `receipt_tax_invoice` (a plain RECEIPT
 * for a non-VAT invoice — `vat_amount = 0` — a RECEIPT_TAX_INVOICE otherwise) from the RECEIPT
 * sequence, plus a `wht_certificate` when the invoice carries a `wht_rate`. Emits
 * `PaymentReceived`. Runs inside the caller's `uow.withTransaction`.
 */
@Injectable()
export class PaymentService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sequences: SequenceService,
    private readonly events: EventBusService,
  ) {}

  async record(
    invoiceId: string,
    input: RecordPaymentRequest,
    actor: AuthUser,
  ): Promise<{ payment: PaymentDto; receipt: ReceiptDto | null }> {
    const ex = currentExecutor(this.db);

    const [inv] = await ex.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
    if (!inv) throw new NotFoundError(`Invoice not found: ${invoiceId}`);
    if (!PAYABLE.has(inv.status)) {
      throw new StateConflictError(
        `Invoice ${inv.docNo} cannot accept a payment in status ${inv.status}`,
      );
    }

    const [pay] = await ex
      .insert(payment)
      .values({
        invoiceId,
        method: input.method,
        amount: input.amount,
        promptpayRef: input.promptpay_ref ?? null,
      })
      .returning();
    if (!pay) throw new StateConflictError("Payment could not be recorded");

    // Net receivable = grand − wht; PAID once amount_paid reaches it.
    const netDue = toDecimal(inv.grandTotal).minus(toDecimal(inv.whtAmount));
    const newPaid = toDecimal(inv.amountPaid).plus(toDecimal(input.amount));
    const fullyPaid = newPaid.greaterThanOrEqualTo(netDue);
    const status: InvoiceStatus = fullyPaid ? "PAID" : "PARTIALLY_PAID";

    await ex
      .update(invoice)
      .set({
        amountPaid: formatMoney(newPaid),
        status,
        version: inv.version + 1,
      })
      .where(eq(invoice.id, invoiceId));

    // Issue the receipt on the first payment only.
    let receipt: ReceiptDto | null = null;
    const [existing] = await ex
      .select({ id: receiptTaxInvoice.id })
      .from(receiptTaxInvoice)
      .where(eq(receiptTaxInvoice.invoiceId, invoiceId))
      .limit(1);
    if (!existing) {
      const type: ReceiptType = toDecimal(inv.vatAmount).isZero()
        ? "RECEIPT"
        : "RECEIPT_TAX_INVOICE";
      const docNo = await this.sequences.next("RECEIPT");
      const [receiptRow] = await ex
        .insert(receiptTaxInvoice)
        .values({ invoiceId, docNo, type })
        .returning();
      if (receiptRow) receipt = toReceiptDto(receiptRow);

      // A WHT certificate accompanies the receipt when the invoice withholds tax.
      if (inv.whtRate !== null && !toDecimal(inv.whtAmount).isZero()) {
        await ex
          .insert(whtCertificate)
          .values({
            invoiceId,
            certNo: `WHT-${inv.docNo}`,
            amount: inv.whtAmount,
          })
          .onConflictDoNothing();
      }
    }

    this.events.publishAfterCommit(
      makeEvent<PaymentReceivedPayload>({
        event: SALES_EVENTS.paymentReceived,
        actorUserId: actor.id,
        payload: {
          invoice_id: invoiceId,
          payment_id: pay.id,
          amount: pay.amount,
          fully_paid: fullyPaid,
        },
      }),
    );

    return { payment: toPaymentDto(pay), receipt };
  }
}
