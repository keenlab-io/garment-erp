import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { invoice, receiptTaxInvoice, type Db } from "@erp/db";
import type { Invoice as InvoiceDto } from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { AuditService } from "../audit/audit.service.js";
import {
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { loadLines } from "./doc-lines.js";
import { SALES_EVENTS, type DocumentVoidedPayload } from "./sales.events.js";
import { toInvoiceDto } from "./sales.util.js";

/**
 * Void an invoice (task 5.8, spec §5.5, design D8). Requires a non-blank reason (`422` on
 * blank via `AuditService.requireReason`), never deletes — it flips the status to **VOID** —
 * and is **blocked with 409 if a `receipt_tax_invoice` already exists** (a receipted document
 * can't be voided). It emits `DocumentVoided` so M3 posts a compensating IN for any stock OUT,
 * and writes an `audit_log` row (`action = VOID`, reason). Runs inside `uow.withTransaction`.
 */
@Injectable()
export class VoidService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
  ) {}

  async voidInvoice(
    invoiceId: string,
    reason: string,
    actor: AuthUser,
  ): Promise<InvoiceDto> {
    const cleanReason = this.audit.requireReason(reason);
    const ex = currentExecutor(this.db);

    const [inv] = await ex.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
    if (!inv) throw new NotFoundError(`Invoice not found: ${invoiceId}`);
    if (inv.status === "VOID") {
      throw new StateConflictError(`Invoice ${inv.docNo} is already void`);
    }

    const [receipt] = await ex
      .select({ id: receiptTaxInvoice.id })
      .from(receiptTaxInvoice)
      .where(eq(receiptTaxInvoice.invoiceId, invoiceId))
      .limit(1);
    if (receipt) {
      throw new StateConflictError(
        `Invoice ${inv.docNo} cannot be voided — a receipt/tax-invoice has already been issued`,
      );
    }

    const [updated] = await ex
      .update(invoice)
      .set({ status: "VOID", version: inv.version + 1 })
      .where(eq(invoice.id, invoiceId))
      .returning();
    if (!updated) throw new StateConflictError("Invoice update failed");

    await this.audit.record({
      action: "VOID",
      entityType: "invoice",
      entityId: invoiceId,
      actorUserId: actor.id,
      before: { status: inv.status },
      after: { status: "VOID" },
      reason: cleanReason,
    });

    this.events.publishAfterCommit(
      makeEvent<DocumentVoidedPayload>({
        event: SALES_EVENTS.documentVoided,
        actorUserId: actor.id,
        payload: { document_id: invoiceId },
      }),
    );

    const lines = await loadLines(ex, "INVOICE", invoiceId);
    return toInvoiceDto(updated, lines);
  }
}
