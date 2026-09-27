import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_ID,
  auditLog,
  createDb,
  documentSequence,
  invoice as invoiceTable,
  tenant,
} from "@erp/db";
import {
  asMoney,
  asQty,
  type CreateInvoiceRequest,
  type CreateQuotationRequest,
  type DocLineInput,
} from "@erp/contracts";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { AuditService } from "../../src/audit/audit.service.js";
import {
  BusinessRuleError,
  StateConflictError,
} from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { DefaultTenantUnitOfWork } from "./tenant-harness.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import { SequenceService } from "../../src/sequence/sequence.service.js";
import { AgingReportService } from "../../src/sales/aging-report.service.js";
import { CustomerService } from "../../src/sales/customer.service.js";
import { InvoiceService } from "../../src/sales/invoice.service.js";
import { OverdueMonitorWorker } from "../../src/sales/overdue-monitor.worker.js";
import { PaymentService } from "../../src/sales/payment.service.js";
import { QuotationService } from "../../src/sales/quotation.service.js";
import { TotalsService } from "../../src/sales/totals.service.js";
import { VoidService } from "../../src/sales/void.service.js";
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

const SEQUENCES = [
  { key: "QUOTATION_VAT", prefix: "QV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "QUOTATION_NONVAT", prefix: "QNV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "INVOICE", prefix: "INV", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
  { key: "RECEIPT", prefix: "RE", includeYear: true, resetYearly: true, format: "{prefix}{yyyy}{seq:0000}" },
];

// Gated on DATABASE_URL_TEST (Testcontainers globalSetup). Drives the M5 sales services against
// a real Postgres, covering the spec §5.8 lifecycle acceptance criteria (tasks 6.3–6.6): convert
// once (re-convert → 409), partial-billing ceiling (→ 422), void-after-receipt (→ 409) + the
// audit row, and race-free document numbering.
describe.skipIf(!url)("Sales services (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let customers: CustomerService;
  let quotations: QuotationService;
  let invoices: InvoiceService;
  let payments: PaymentService;
  let voids: VoidService;
  let customerId: string;

  const actor: AuthUser = {
    id: randomUUID(),
    sessionId: randomUUID(),
    tenantId: DEFAULT_TENANT_ID,
    isSuperAdmin: true,
    permissions: new Set(),
  };

  function line(qty: string, unitPrice: string): DocLineInput {
    return { description: "Widget", qty: asQty(qty), unit_price: asMoney(unitPrice) };
  }

  beforeAll(async () => {
    conn = createDb(url as string, { max: 25 });
    const emitter = new EventEmitter2();
    const events = new EventBusService(emitter);
    uow = new DefaultTenantUnitOfWork(conn.db);
    const sequences = new SequenceService(conn.db, uow);
    const totals = new TotalsService();
    const audit = new AuditService(conn.db);
    customers = new CustomerService(conn.db);
    quotations = new QuotationService(conn.db, sequences, events, totals);
    invoices = new InvoiceService(conn.db, sequences, events, totals);
    payments = new PaymentService(conn.db, sequences, events);
    voids = new VoidService(conn.db, audit, events);

    for (const s of SEQUENCES) {
      await conn.db
        .insert(documentSequence)
        .values({ ...s, yearScope: new Date().getFullYear() })
        .onConflictDoNothing();
    }

    const cust = await uow.withTransaction(() =>
      customers.create({ name: "ACME Co", addresses: [], credit_terms_days: 30 }, actor),
    );
    customerId = cust.id;
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("converts an APPROVED quotation once, copying lines/prices; re-convert → 409", async () => {
    const req: CreateQuotationRequest = {
      customer_id: customerId,
      vat_mode: "VAT",
      vat_calc: "VatNok",
      lines: [line("2", "100"), line("1", "50")],
    };
    const quote = await uow.withTransaction(() => quotations.create(req));
    await uow.withTransaction(() => quotations.send(quote.id));
    await uow.withTransaction(() => quotations.approve(quote.id, actor));

    const invoice = await uow.withTransaction(() => quotations.convert(quote.id));
    expect(invoice.quotation_id).toBe(quote.id);
    expect(invoice.subtotal).toBe(quote.subtotal);
    expect(invoice.lines.map((l) => l.line_total).sort()).toEqual(
      quote.lines.map((l) => l.line_total).sort(),
    );

    const reloaded = await quotations.detail(quote.id);
    expect(reloaded.status).toBe("CONVERTED");

    await expect(
      uow.withTransaction(() => quotations.convert(quote.id)),
    ).rejects.toBeInstanceOf(StateConflictError);
  });

  it("enforces the partial-billing ceiling (Σ subtotals ≤ quotation subtotal → 422)", async () => {
    const quote = await uow.withTransaction(() =>
      quotations.create({
        customer_id: customerId,
        vat_mode: "NON_VAT",
        vat_calc: "VatNok",
        lines: [line("10", "100")], // subtotal 1000
      }),
    );

    const first: CreateInvoiceRequest = {
      customer_id: customerId,
      from_quotation_id: quote.id,
      lines: [line("6", "100")], // subtotal 600 ≤ 1000
    };
    await uow.withTransaction(() => invoices.create(first));

    const second: CreateInvoiceRequest = {
      customer_id: customerId,
      from_quotation_id: quote.id,
      lines: [line("5", "100")], // 600 + 500 = 1100 > 1000
    };
    await expect(
      uow.withTransaction(() => invoices.create(second)),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("blocks a void after a receipt exists (→ 409)", async () => {
    const invoice = await uow.withTransaction(() =>
      invoices.create({ customer_id: customerId, lines: [line("1", "100")] }),
    );
    await uow.withTransaction(() => invoices.issue(invoice.id, actor));

    const { receipt } = await uow.withTransaction(() =>
      payments.record(invoice.id, { amount: asMoney("107.0000"), method: "CASH" }, actor),
    );
    expect(receipt).not.toBeNull();

    await expect(
      uow.withTransaction(() => voids.voidInvoice(invoice.id, "customer cancelled", actor)),
    ).rejects.toBeInstanceOf(StateConflictError);
  });

  it("voids an un-receipted invoice and writes an audit_log VOID row", async () => {
    const invoice = await uow.withTransaction(() =>
      invoices.create({ customer_id: customerId, lines: [line("1", "100")] }),
    );
    await uow.withTransaction(() => invoices.issue(invoice.id, actor));

    const voided = await uow.withTransaction(() =>
      voids.voidInvoice(invoice.id, "duplicate document", actor),
    );
    expect(voided.status).toBe("VOID");

    const rows = await conn.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "invoice"), eq(auditLog.entityId, invoice.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("VOID");
    expect(rows[0]?.reason).toBe("duplicate document");
  });

  it("issues zero duplicate doc_no under concurrent quotation creation", async () => {
    const N = 20;
    const created = await Promise.all(
      Array.from({ length: N }, () =>
        uow.withTransaction(() =>
          quotations.create({
            customer_id: customerId,
            vat_mode: "VAT",
            vat_calc: "VatNok",
            lines: [line("1", "100")],
          }),
        ),
      ),
    );
    const docNos = created.map((q) => q.doc_no);
    expect(new Set(docNos).size).toBe(N);
  });
});

// M7 §12 — sales is per-tenant: `doc_no` numbering + uniqueness are `(tenant_id, doc_no)`, the
// overdue sweep runs per tenant, and the customer search / aging report stay inside the caller's
// tenant. The harness connects as the superuser (RLS bypassed), so these pin the services' own
// tenant predicates.
describe.skipIf(!url)("Sales is per-tenant (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let customers: CustomerService;
  let invoices: InvoiceService;
  let aging: AgingReportService;
  let overdue: OverdueMonitorWorker;
  let tenantB: string;

  const actorFor = (tenantId: string): AuthUser => ({
    id: randomUUID(),
    sessionId: randomUUID(),
    tenantId,
    isSuperAdmin: true,
    permissions: new Set(),
  });
  const inTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    runWithTenant(tenantId, "jwt", () => uow.withTransaction(fn));

  beforeAll(async () => {
    conn = createDb(url as string, { max: 1 });
    const events = new EventBusService(new EventEmitter2());
    uow = new DefaultTenantUnitOfWork(conn.db);
    const sequences = new SequenceService(conn.db, uow);
    customers = new CustomerService(conn.db);
    invoices = new InvoiceService(conn.db, sequences, events, new TotalsService());
    aging = new AgingReportService(conn.db);
    overdue = new OverdueMonitorWorker(
      conn.db,
      {} as Queue,
      uow,
      { get: () => 86_400_000 } as unknown as ConfigService,
      events,
    );

    const [other] = await conn.db
      .insert(tenant)
      .values({ slug: `sales-b-${randomUUID().slice(0, 8)}`, name: "Sales tenant B", kind: "CUSTOMER" })
      .returning({ id: tenant.id });
    tenantB = (other as { id: string }).id;

    for (const tenantId of [DEFAULT_TENANT_ID, tenantB]) {
      for (const s of SEQUENCES) {
        await conn.db
          .insert(documentSequence)
          .values({ ...s, tenantId, yearScope: new Date().getFullYear() })
          .onConflictDoNothing();
      }
    }
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  async function makeInvoice(tenantId: string, name = `C-${randomUUID().slice(0, 8)}`) {
    const cust = await inTenant(tenantId, () =>
      customers.create({ name, addresses: [], credit_terms_days: 30 }, actorFor(tenantId)),
    );
    const inv = await inTenant(tenantId, () =>
      invoices.create({
        customer_id: cust.id,
        lines: [{ description: "Widget", qty: asQty("1"), unit_price: asMoney("100") }],
      }),
    );
    return { customerId: cust.id, customerName: name, inv };
  }

  const invoiceSequence = (tenantId: string) =>
    and(eq(documentSequence.tenantId, tenantId), eq(documentSequence.key, "INVOICE"));

  it("doc_no is numbered and unique per tenant: both tenants may hold the same doc_no", async () => {
    const a = await makeInvoice(DEFAULT_TENANT_ID);
    const [seqA] = await conn.db.select().from(documentSequence).where(invoiceSequence(DEFAULT_TENANT_ID));

    // Line tenant B's sequence up so its next number is the one tenant A just minted.
    await conn.db
      .update(documentSequence)
      .set({ currentValue: seqA!.currentValue - 1, yearScope: seqA!.yearScope })
      .where(invoiceSequence(tenantB));
    const b = await makeInvoice(tenantB);
    expect(b.inv.doc_no).toBe(a.inv.doc_no);

    const [rowB] = await conn.db.select().from(invoiceTable).where(eq(invoiceTable.id, b.inv.id));
    expect(rowB?.tenantId).toBe(tenantB);

    // Within one tenant the same doc_no is still a conflict (the insert rolls the sequence back).
    await conn.db
      .update(documentSequence)
      .set({ currentValue: seqA!.currentValue - 1 })
      .where(invoiceSequence(DEFAULT_TENANT_ID));
    await expect(makeInvoice(DEFAULT_TENANT_ID)).rejects.toThrow();
    await conn.db
      .update(documentSequence)
      .set({ currentValue: seqA!.currentValue })
      .where(invoiceSequence(DEFAULT_TENANT_ID));
  });

  it("the overdue sweep flips only its own tenant's past-due invoices", async () => {
    const a = await makeInvoice(DEFAULT_TENANT_ID);
    const b = await makeInvoice(tenantB);
    for (const [tenantId, id] of [
      [DEFAULT_TENANT_ID, a.inv.id],
      [tenantB, b.inv.id],
    ] as const) {
      await inTenant(tenantId, () => invoices.issue(id, actorFor(tenantId)));
      await conn.db.update(invoiceTable).set({ dueDate: "2000-01-01" }).where(eq(invoiceTable.id, id));
    }

    const status = async (id: string) =>
      (await conn.db.select().from(invoiceTable).where(eq(invoiceTable.id, id)))[0]?.status;

    await inTenant(tenantB, () => overdue.sweep(new Date()));
    expect(await status(b.inv.id)).toBe("OVERDUE");
    expect(await status(a.inv.id)).toBe("ISSUED");

    await inTenant(DEFAULT_TENANT_ID, () => overdue.sweep(new Date()));
    expect(await status(a.inv.id)).toBe("OVERDUE");
  });

  it("the customer search and aging report stay inside the caller's tenant", async () => {
    const tag = randomUUID().slice(0, 8);
    const a = await makeInvoice(DEFAULT_TENANT_ID, `Shared ${tag}`);
    const b = await makeInvoice(tenantB, `Shared ${tag}`);
    await inTenant(DEFAULT_TENANT_ID, () => invoices.issue(a.inv.id, actorFor(DEFAULT_TENANT_ID)));
    await inTenant(tenantB, () => invoices.issue(b.inv.id, actorFor(tenantB)));

    const found = await inTenant(tenantB, () => customers.list({ limit: 50, search: tag }));
    expect(found.data.map((c) => c.id)).toEqual([b.customerId]);

    const report = await inTenant(tenantB, () => aging.report({}));
    const ids = report.map((r) => r.customer_id);
    expect(ids).toContain(b.customerId);
    expect(ids).not.toContain(a.customerId);
  });
});
