import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { customer, invoice, quotation, type Db } from "@erp/db";
import {
  asMoney,
  asQty,
  type CreateQuotationRequest,
  type Invoice as InvoiceDto,
  type Quotation as QuotationDto,
  type QuotationStatus,
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
import { loadLines, persistLines } from "./doc-lines.js";
import { SALES_EVENTS, type QuotationApprovedPayload } from "./sales.events.js";
import { addDays, isoDate, toInvoiceDto, toQuotationDto } from "./sales.util.js";
import { TotalsService } from "./totals.service.js";

/**
 * Quotations (task 5.2, spec §5.3). Create issues a `doc_no` from the QV (VAT) / QNV (non-VAT)
 * sequence and materializes server-computed totals + lines. The lifecycle is strictly forward
 * (`DRAFT → SENT → APPROVED → CONVERTED`, with REJECTED off SENT); `approve` emits
 * `QuotationApproved`. **Convert** copies an APPROVED quotation's lines/prices into a new
 * invoice and flips the quotation to CONVERTED in one transaction — a re-convert is a 409
 * (the status is no longer APPROVED). Runs inside the caller's `uow.withTransaction`.
 */
@Injectable()
export class QuotationService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sequences: SequenceService,
    private readonly events: EventBusService,
    private readonly totals: TotalsService,
  ) {}

  async create(input: CreateQuotationRequest): Promise<QuotationDto> {
    const ex = currentExecutor(this.db);

    const [cust] = await ex
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.id, input.customer_id))
      .limit(1);
    if (!cust) throw new NotFoundError(`Customer not found: ${input.customer_id}`);

    const computed = this.totals.compute(input.lines, {
      vat_mode: input.vat_mode,
      vat_calc: input.vat_calc,
    });

    const seqKey = input.vat_mode === "VAT" ? "QUOTATION_VAT" : "QUOTATION_NONVAT";
    const docNo = await this.sequences.next(seqKey);

    const [row] = await ex
      .insert(quotation)
      .values({
        docNo,
        customerId: input.customer_id,
        vatMode: input.vat_mode,
        vatCalc: input.vat_calc,
        validUntil: input.valid_until ?? null,
        subtotal: computed.subtotal,
        vatAmount: computed.vat_amount,
        grandTotal: computed.grand_total,
      })
      .returning();
    if (!row) throw new StateConflictError("Quotation could not be created");

    const lines = await persistLines(ex, "QUOTATION", row.id, computed.lines);
    return toQuotationDto(row, lines);
  }

  /** `DRAFT → SENT`. */
  async send(id: string): Promise<QuotationDto> {
    return this.transition(id, "DRAFT", "SENT");
  }

  /** `SENT → APPROVED`, emitting `QuotationApproved`. */
  async approve(id: string, actor: AuthUser): Promise<QuotationDto> {
    const dto = await this.transition(id, "SENT", "APPROVED");
    this.events.publishAfterCommit(
      makeEvent<QuotationApprovedPayload>({
        event: SALES_EVENTS.quotationApproved,
        actorUserId: actor.id,
        payload: { quotation_id: dto.id, doc_no: dto.doc_no },
      }),
    );
    return dto;
  }

  /** `SENT → REJECTED`. */
  async reject(id: string): Promise<QuotationDto> {
    return this.transition(id, "SENT", "REJECTED");
  }

  /**
   * Convert an **APPROVED** quotation to a new DRAFT invoice: copy its lines/prices, recompute
   * totals, flip the quotation to CONVERTED. Re-convert → 409 (status no longer APPROVED).
   */
  async convert(id: string): Promise<InvoiceDto> {
    const ex = currentExecutor(this.db);

    const [quote] = await ex.select().from(quotation).where(eq(quotation.id, id)).limit(1);
    if (!quote) throw new NotFoundError(`Quotation not found: ${id}`);
    if (quote.status !== "APPROVED") {
      throw new StateConflictError(
        `Quotation ${quote.docNo} cannot be converted from status ${quote.status}`,
      );
    }

    const [cust] = await ex
      .select({ creditTermsDays: customer.creditTermsDays })
      .from(customer)
      .where(eq(customer.id, quote.customerId))
      .limit(1);

    const srcLines = await loadLines(ex, "QUOTATION", id);
    const computed = this.totals.compute(
      srcLines.map((l) => ({
        item_id: l.itemId ?? undefined,
        description: l.description,
        qty: asQty(l.qty),
        unit_price: asMoney(l.unitPrice),
        discount: asMoney(l.discount),
      })),
      { vat_mode: quote.vatMode, vat_calc: quote.vatCalc },
    );

    const docNo = await this.sequences.next("INVOICE");
    const issueDate = isoDate(new Date());
    const dueDate = cust ? addDays(issueDate, cust.creditTermsDays) : null;

    const [inv] = await ex
      .insert(invoice)
      .values({
        docNo,
        quotationId: quote.id,
        customerId: quote.customerId,
        issueDate,
        dueDate,
        whtRate: null,
        subtotal: computed.subtotal,
        vatAmount: computed.vat_amount,
        whtAmount: computed.wht_amount,
        grandTotal: computed.grand_total,
      })
      .returning();
    if (!inv) throw new StateConflictError("Invoice could not be created");

    const invLines = await persistLines(ex, "INVOICE", inv.id, computed.lines);

    await ex
      .update(quotation)
      .set({ status: "CONVERTED", version: quote.version + 1 })
      .where(eq(quotation.id, id));

    return toInvoiceDto(inv, invLines);
  }

  /** Load a quotation with its lines (404 if missing). */
  async detail(id: string): Promise<QuotationDto> {
    const ex = currentExecutor(this.db);
    const [row] = await ex.select().from(quotation).where(eq(quotation.id, id)).limit(1);
    if (!row) throw new NotFoundError(`Quotation not found: ${id}`);
    const lines = await loadLines(ex, "QUOTATION", id);
    return toQuotationDto(row, lines);
  }

  /** Enforce a forward transition from `from` to `to`, bumping the version. */
  private async transition(
    id: string,
    from: QuotationStatus,
    to: QuotationStatus,
  ): Promise<QuotationDto> {
    const ex = currentExecutor(this.db);
    const [row] = await ex.select().from(quotation).where(eq(quotation.id, id)).limit(1);
    if (!row) throw new NotFoundError(`Quotation not found: ${id}`);
    if (row.status !== from) {
      throw new StateConflictError(
        `Quotation ${row.docNo} cannot move to ${to} from status ${row.status}`,
      );
    }
    const [updated] = await ex
      .update(quotation)
      .set({ status: to, version: row.version + 1 })
      .where(eq(quotation.id, id))
      .returning();
    if (!updated) throw new StateConflictError("Quotation update failed");
    const lines = await loadLines(ex, "QUOTATION", id);
    return toQuotationDto(updated, lines);
  }
}
