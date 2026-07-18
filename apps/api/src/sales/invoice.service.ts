import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ne } from "drizzle-orm";
import { customer, invoice, quotation, type Db } from "@erp/db";
import { sumMoney, toDecimal } from "@erp/utils";
import type {
  CreateInvoiceRequest,
  Invoice as InvoiceDto,
  VatApplicability,
  VatMode,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { SequenceService } from "../sequence/sequence.service.js";
import { loadLines, persistLines } from "./doc-lines.js";
import { SALES_EVENTS, type SalesIssuedPayload, type SalesStockLine } from "./sales.events.js";
import { addDays, isoDate, toInvoiceDto } from "./sales.util.js";
import { TotalsService } from "./totals.service.js";

/**
 * Invoices (task 5.4, spec §5.3/§5.5). Create computes server-side totals (VAT + optional WHT)
 * and issues a `doc_no` from the INVOICE sequence. When linked to a quotation
 * (`from_quotation_id`) it inherits that quotation's VAT treatment and enforces the
 * **partial-billing ceiling** — `Σ(invoice subtotals) ≤ quotation subtotal` → 422 on exceed.
 * `issue` moves DRAFT → ISSUED and emits `InvoiceIssued` (the optional M3 stock OUT, atomic
 * in-tx). Runs inside the caller's `uow.withTransaction`.
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sequences: SequenceService,
    private readonly events: EventBusService,
    private readonly totals: TotalsService,
  ) {}

  async create(input: CreateInvoiceRequest): Promise<InvoiceDto> {
    const ex = currentExecutor(this.db);

    const [cust] = await ex
      .select({ id: customer.id, creditTermsDays: customer.creditTermsDays })
      .from(customer)
      .where(eq(customer.id, input.customer_id))
      .limit(1);
    if (!cust) throw new NotFoundError(`Customer not found: ${input.customer_id}`);

    // A quotation-linked invoice inherits that quotation's VAT treatment; a standalone invoice
    // defaults to VAT-exclusive (VatNok), the common "add 7% on top" case.
    let vatMode: VatApplicability = "VAT";
    let vatCalc: VatMode = "VatNok";
    if (input.from_quotation_id) {
      const [quote] = await ex
        .select()
        .from(quotation)
        .where(eq(quotation.id, input.from_quotation_id))
        .limit(1);
      if (!quote) {
        throw new NotFoundError(`Quotation not found: ${input.from_quotation_id}`);
      }
      vatMode = quote.vatMode;
      vatCalc = quote.vatCalc;
    }

    const computed = this.totals.compute(input.lines, {
      vat_mode: vatMode,
      vat_calc: vatCalc,
      wht_rate: input.wht_rate ?? null,
    });

    // Partial-billing ceiling (design D6): the running Σ of subtotals billed against a
    // quotation may not exceed the quotation's subtotal.
    if (input.from_quotation_id) {
      await this.assertUnderBillingCeiling(
        input.from_quotation_id,
        computed.subtotal,
      );
    }

    const docNo = await this.sequences.next("INVOICE");
    const issueDate = isoDate(new Date());
    const dueDate =
      input.due_date ??
      addDays(issueDate, input.credit_terms_days ?? cust.creditTermsDays);

    const [row] = await ex
      .insert(invoice)
      .values({
        docNo,
        quotationId: input.from_quotation_id ?? null,
        customerId: input.customer_id,
        issueDate,
        dueDate,
        whtRate: input.wht_rate ?? null,
        subtotal: computed.subtotal,
        vatAmount: computed.vat_amount,
        whtAmount: computed.wht_amount,
        grandTotal: computed.grand_total,
      })
      .returning();
    if (!row) throw new StateConflictError("Invoice could not be created");

    const lines = await persistLines(ex, "INVOICE", row.id, computed.lines);
    return toInvoiceDto(row, lines);
  }

  /** `DRAFT → ISSUED`, emitting `InvoiceIssued` for the optional stock OUT (atomic in-tx). */
  async issue(id: string, actor: AuthUser): Promise<InvoiceDto> {
    const ex = currentExecutor(this.db);
    const [row] = await ex.select().from(invoice).where(eq(invoice.id, id)).limit(1);
    if (!row) throw new NotFoundError(`Invoice not found: ${id}`);
    if (row.status !== "DRAFT") {
      throw new StateConflictError(
        `Invoice ${row.docNo} cannot be issued from status ${row.status}`,
      );
    }

    const [updated] = await ex
      .update(invoice)
      .set({ status: "ISSUED", version: row.version + 1 })
      .where(eq(invoice.id, id))
      .returning();
    if (!updated) throw new StateConflictError("Invoice update failed");

    const lines = await loadLines(ex, "INVOICE", id);
    // Only stocked lines (with an item) drive a stock OUT; warehouse/UOM default in M3.
    const stockLines: SalesStockLine[] = lines
      .filter((l) => l.itemId !== null)
      .map((l) => ({ item_id: l.itemId as string, warehouse_id: "", qty: l.qty, uom_id: "" }));
    await this.events.publishInTransaction(
      makeEvent<SalesIssuedPayload>({
        event: SALES_EVENTS.invoiceIssued,
        actorUserId: actor.id,
        payload: { document_id: id, lines: stockLines },
      }),
    );

    return toInvoiceDto(updated, lines);
  }

  async detail(id: string): Promise<InvoiceDto> {
    const ex = currentExecutor(this.db);
    const [row] = await ex.select().from(invoice).where(eq(invoice.id, id)).limit(1);
    if (!row) throw new NotFoundError(`Invoice not found: ${id}`);
    const lines = await loadLines(ex, "INVOICE", id);
    return toInvoiceDto(row, lines);
  }

  private async assertUnderBillingCeiling(
    quotationId: string,
    newSubtotal: string,
  ): Promise<void> {
    const ex = currentExecutor(this.db);
    const [quote] = await ex
      .select({ subtotal: quotation.subtotal })
      .from(quotation)
      .where(eq(quotation.id, quotationId))
      .limit(1);
    if (!quote) throw new NotFoundError(`Quotation not found: ${quotationId}`);

    const billed = await ex
      .select({ subtotal: invoice.subtotal })
      .from(invoice)
      .where(
        and(eq(invoice.quotationId, quotationId), ne(invoice.status, "VOID")),
      );

    const runningTotal = sumMoney([
      ...billed.map((b) => b.subtotal),
      newSubtotal,
    ]);
    if (toDecimal(runningTotal).greaterThan(toDecimal(quote.subtotal))) {
      throw new BusinessRuleError(
        `Billing ceiling exceeded: ${runningTotal} would exceed quotation subtotal ${quote.subtotal}`,
      );
    }
  }
}
