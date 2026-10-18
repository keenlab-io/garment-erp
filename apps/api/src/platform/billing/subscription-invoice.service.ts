import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, getTableColumns, ne, sql } from "drizzle-orm";
import { subscriptionInvoice, tenant, type Db, type Tx } from "@erp/db";
import {
  asMoney,
  type SubscriptionInvoice,
  type SubscriptionInvoiceIssue,
  type SubscriptionInvoiceLine,
  type SubscriptionInvoiceMarkPaid,
  type SubscriptionInvoiceStatus,
} from "@erp/contracts";
import { formatMoney, tryDecodeCursor } from "@erp/utils";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
} from "../../common/errors/app-exception.js";
import { buildPage } from "../../common/pagination/cursor.js";
import { DB } from "../../db/db.tokens.js";
import { currentExecutor } from "../../db/tx-context.js";
import { UnitOfWork } from "../../db/unit-of-work.service.js";
import { PdfService } from "../../pdf/pdf.service.js";
import { StorageService } from "../../storage/storage.service.js";
import { PlatformAuditService } from "../platform-audit.service.js";
import {
  assertPaidAmount,
  buildInvoiceLines,
  formatInvoiceNumber,
  invoicePeriod,
  invoiceTotals,
} from "./billing-math.js";
import {
  renderSubscriptionInvoiceHtml,
  vendorPromptPayQr,
  type VendorPaymentDetails,
} from "./subscription-invoice-pdf.js";
import { SubscriptionService } from "./subscription.service.js";

type InvoiceRow = typeof subscriptionInvoice.$inferSelect;

/** Filters accepted by `GET /platform/subscription-invoices`. */
export interface SubscriptionInvoiceFilters {
  limit: number;
  cursor?: string;
  tenant_id?: string;
  subscription_id?: string;
  status?: SubscriptionInvoiceStatus;
}

interface InvoiceCursor {
  issued_at: string;
  id: string;
}

/** Lifetime of the presigned invoice-PDF URL. */
const PDF_URL_TTL_SECONDS = 15 * 60;

/** Asia/Bangkok is UTC+7 with no DST — the invoice year is the Thai calendar year of issue. */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export const toSubscriptionInvoice = (r: InvoiceRow): SubscriptionInvoice => ({
  id: r.id,
  number: r.number,
  subscription_id: r.subscriptionId,
  tenant_id: r.tenantId,
  status: r.status,
  lines: r.lines as SubscriptionInvoiceLine[],
  subtotal: asMoney(r.subtotal),
  // Subscription invoices are VAT-exclusive: the total carries no VAT component.
  vat_amount: asMoney(formatMoney(0)),
  total: asMoney(r.total),
  issued_at: r.issuedAt.toISOString(),
  due_date: r.dueDate ?? null,
  paid_at: r.paidAt ? r.paidAt.toISOString() : null,
  payment_method: r.paidMethod ?? null,
  payment_reference: r.paidReference ?? null,
  paid_amount: r.paidAmount === null ? null : asMoney(r.paidAmount),
  voided_at: r.voidedAt ? r.voidedAt.toISOString() : null,
});

/**
 * Vendor-side subscription invoices (M9 §3.2/3.3, design D1/D2/D7) — structurally separate from
 * the tenant-facing M5 `invoice`: control-plane table, `SINV-{YYYY}-{seq}` numbers from the
 * dedicated `subscription_invoice_seq` (never `document_sequence`), no RLS, no tenant scope.
 *
 * - `issue` — typed lines (`SETUP_FEE` only on the first invoice, a negative `UPFRONT_DISCOUNT`
 *   defaulting to `annual_fee × 2/12`), VAT-exclusive totals via `@erp/utils`; the subscription row
 *   is locked so two concurrent issues agree on which is "first".
 * - `void` — unpaid invoices only.
 * - `markPaid` — one `UnitOfWork` transaction: 422 on an amount mismatch unless overridden, the
 *   invoice becomes `PAID`, the subscription term extends from the previous `term_end` and returns
 *   to `ACTIVE` (leaving `READ_ONLY` if it had expired), and ONE audit row holds the before/after.
 * - `pdfUrl` — renders through M0 `PdfService` with the vendor's bank details + PromptPay QR from
 *   `PLATFORM_PROMPTPAY_ID`, stores it under the control-plane key space, and presigns it.
 *
 * Every mutation writes `platform_audit_log` in the same transaction.
 */
@Injectable()
export class SubscriptionInvoiceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly audit: PlatformAuditService,
    private readonly subscriptions: SubscriptionService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Issue an invoice. `platformAdminId` is `null` when the dunning sweep auto-issues a renewal
   * (design D5); `opts.renewal` then forces renewal lines + period (never a `SETUP_FEE`, bills the
   * year from `term_end`) even if the subscription was never invoiced before.
   */
  async issue(
    input: SubscriptionInvoiceIssue,
    platformAdminId: string | null,
    opts: { renewal?: boolean } = {},
  ): Promise<SubscriptionInvoice> {
    return this.uow.withTransaction(async (tx) => {
      const sub = await this.subscriptions.lock(tx, input.subscription_id);
      if (sub.status === "CANCELLED") {
        throw new StateConflictError("Cannot invoice a cancelled subscription");
      }
      const [prior] = await tx
        .select({ id: subscriptionInvoice.id })
        .from(subscriptionInvoice)
        .where(
          and(
            eq(subscriptionInvoice.subscriptionId, sub.id),
            ne(subscriptionInvoice.status, "VOID"),
          ),
        )
        .limit(1);
      const isFirstInvoice = !prior && !opts.renewal;

      const lines = buildInvoiceLines({
        annualFee: sub.annualFee,
        setupFee: input.setup_fee,
        extraSeats: input.extra_seats,
        upfrontDiscount: input.upfront_discount,
        isFirstInvoice,
      });
      const totals = invoiceTotals(lines);
      const period = invoicePeriod(sub, isFirstInvoice);
      const issuedAt = new Date();
      const number = await this.nextNumber(tx, issuedAt);

      const [row] = await tx
        .insert(subscriptionInvoice)
        .values({
          number,
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          lines,
          subtotal: totals.subtotal,
          total: totals.total,
          status: "ISSUED",
          issuedAt,
          dueDate: input.due_date ?? null,
          periodStart: period.start,
          periodEnd: period.end,
          createdBy: platformAdminId,
          updatedBy: platformAdminId,
        })
        .returning();
      const created = toSubscriptionInvoice(row as InvoiceRow);
      await this.audit.append({
        action: "CREATE",
        entityType: "subscription_invoice",
        entityId: created.id,
        tenantId: created.tenant_id,
        platformAdminId,
        after: {
          ...created,
          period_start: period.start.toISOString(),
          period_end: period.end.toISOString(),
        },
      });
      return created;
    });
  }

  async list(
    filters: SubscriptionInvoiceFilters,
  ): Promise<{ data: SubscriptionInvoice[]; next_cursor: string | null }> {
    const decoded = filters.cursor
      ? (tryDecodeCursor(filters.cursor) as InvoiceCursor | null)
      : null;
    const where = [
      filters.tenant_id ? eq(subscriptionInvoice.tenantId, filters.tenant_id) : undefined,
      filters.subscription_id
        ? eq(subscriptionInvoice.subscriptionId, filters.subscription_id)
        : undefined,
      filters.status ? eq(subscriptionInvoice.status, filters.status) : undefined,
      sql`${subscriptionInvoice.deletedAt} IS NULL`,
      // `issued_at` travels as Postgres text: microsecond-exact, unlike a JS Date.
      decoded
        ? sql`(${subscriptionInvoice.issuedAt}, ${subscriptionInvoice.id}) < (${decoded.issued_at}::timestamptz, ${decoded.id}::uuid)`
        : undefined,
    ].filter(Boolean);

    const rows = await currentExecutor(this.db)
      .select({
        ...getTableColumns(subscriptionInvoice),
        cursorAt: sql<string>`${subscriptionInvoice.issuedAt}::text`,
      })
      .from(subscriptionInvoice)
      .where(and(...where))
      .orderBy(desc(subscriptionInvoice.issuedAt), desc(subscriptionInvoice.id))
      .limit(filters.limit + 1);

    const page = buildPage(rows, filters.limit, (r) => ({ issued_at: r.cursorAt, id: r.id }));
    return { data: page.data.map(toSubscriptionInvoice), next_cursor: page.next_cursor };
  }

  /** Void an unpaid invoice (409 once `PAID` or already `VOID`); audited with the reason. */
  async void(id: string, reason: string, platformAdminId: string): Promise<SubscriptionInvoice> {
    const why = reason.trim();
    if (!why) throw new BusinessRuleError("A reason is required for this action");
    return this.uow.withTransaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.status !== "ISSUED") {
        throw new StateConflictError(`A ${current.status} invoice cannot be voided`);
      }
      const now = new Date();
      const [row] = await tx
        .update(subscriptionInvoice)
        .set({
          status: "VOID",
          voidedAt: now,
          updatedAt: now,
          updatedBy: platformAdminId,
          version: sql`${subscriptionInvoice.version} + 1`,
        })
        .where(eq(subscriptionInvoice.id, id))
        .returning();
      const after = toSubscriptionInvoice(row as InvoiceRow);
      await this.audit.append({
        action: "VOID",
        entityType: "subscription_invoice",
        entityId: id,
        tenantId: after.tenant_id,
        platformAdminId,
        before: { status: current.status },
        after: { status: after.status, voided_at: after.voided_at },
        reason: why,
      });
      return after;
    });
  }

  /**
   * Record an offline payment (design D1). Everything — amount guard, invoice `PAID`, term
   * extension, status restore, tenant recovery, audit — happens in one transaction, so a rejected
   * amount changes nothing.
   */
  async markPaid(
    id: string,
    body: SubscriptionInvoiceMarkPaid,
    platformAdminId: string,
  ): Promise<SubscriptionInvoice> {
    return this.uow.withTransaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.status !== "ISSUED") {
        throw new StateConflictError(`A ${current.status} invoice cannot be marked paid`);
      }
      assertPaidAmount(current.total, body.amount, body);
      const reference = body.reference.trim();
      if (!reference) {
        throw new BusinessRuleError("A payment reference is required", [
          { field: "reference", issue: "must not be blank" },
        ]);
      }

      const sub = await this.subscriptions.lock(tx, current.subscriptionId);
      const period =
        current.periodStart && current.periodEnd
          ? { start: current.periodStart, end: current.periodEnd }
          : null;
      const applied = await this.subscriptions.applyPayment(tx, sub, period, platformAdminId);

      const [row] = await tx
        .update(subscriptionInvoice)
        .set({
          status: "PAID",
          paidAt: new Date(body.paid_at),
          paidMethod: body.method,
          paidReference: reference,
          paidAmount: formatMoney(body.amount),
          updatedAt: new Date(),
          updatedBy: platformAdminId,
          version: sql`${subscriptionInvoice.version} + 1`,
        })
        .where(eq(subscriptionInvoice.id, id))
        .returning();
      const after = toSubscriptionInvoice(row as InvoiceRow);
      await this.audit.append({
        action: "UPDATE",
        entityType: "subscription_invoice",
        entityId: id,
        tenantId: after.tenant_id,
        platformAdminId,
        before: { invoice: { status: current.status }, subscription: applied.before },
        after: {
          invoice: {
            status: after.status,
            paid_at: after.paid_at,
            payment_method: after.payment_method,
            payment_reference: after.payment_reference,
            paid_amount: after.paid_amount,
            accept_partial: body.accept_partial ?? false,
            accept_over: body.accept_over ?? false,
          },
          subscription: applied.after,
        },
        reason: "Subscription invoice marked paid",
      });
      return after;
    });
  }

  /** Render the invoice PDF, store it in the control-plane key space, and presign it. */
  async pdfUrl(id: string): Promise<{ url: string }> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ invoice: subscriptionInvoice, tenantName: tenant.name })
      .from(subscriptionInvoice)
      .innerJoin(tenant, eq(tenant.id, subscriptionInvoice.tenantId))
      .where(and(eq(subscriptionInvoice.id, id), sql`${subscriptionInvoice.deletedAt} IS NULL`))
      .limit(1);
    if (!row) throw new NotFoundError("Subscription invoice not found");

    const invoice = toSubscriptionInvoice(row.invoice);
    const vendor = this.vendorDetails();
    const qr = await vendorPromptPayQr(vendor.promptpayId, invoice.total);
    const html = renderSubscriptionInvoiceHtml({ invoice, tenantName: row.tenantName, vendor, qr });
    const key = this.storage.platformKey(`billing/subscription-invoices/${invoice.number}.pdf`);
    await this.storage.put(key, await this.pdf.renderHtml(html), "application/pdf");
    return { url: await this.storage.getSignedUrl(key, PDF_URL_TTL_SECONDS) };
  }

  /** The vendor's own payee — `PLATFORM_*` only; a tenant's `PROMPTPAY_ID` is never read here. */
  vendorDetails(): VendorPaymentDetails {
    return {
      promptpayId: this.config.get<string>("PLATFORM_PROMPTPAY_ID"),
      bankName: this.config.get<string>("PLATFORM_BANK_NAME"),
      bankAccountName: this.config.get<string>("PLATFORM_BANK_ACCOUNT_NAME"),
      bankAccountNumber: this.config.get<string>("PLATFORM_BANK_ACCOUNT_NUMBER"),
    };
  }

  private async lock(tx: Tx, id: string): Promise<InvoiceRow> {
    const [row] = await tx
      .select()
      .from(subscriptionInvoice)
      .where(and(eq(subscriptionInvoice.id, id), sql`${subscriptionInvoice.deletedAt} IS NULL`))
      .for("update")
      .limit(1);
    if (!row) throw new NotFoundError("Subscription invoice not found");
    return row;
  }

  /** `SINV-{YYYY}-{seq}` from the dedicated control-plane sequence (design D2). */
  private async nextNumber(tx: Tx, issuedAt: Date): Promise<string> {
    const result = await tx.execute(
      sql`SELECT nextval('subscription_invoice_seq')::text AS seq`,
    );
    const seq = (result as unknown as { seq: string }[])[0]?.seq;
    if (!seq) throw new Error("subscription_invoice_seq returned no value");
    const year = new Date(issuedAt.getTime() + BANGKOK_OFFSET_MS).getUTCFullYear();
    return formatInvoiceNumber(year, seq);
  }
}
