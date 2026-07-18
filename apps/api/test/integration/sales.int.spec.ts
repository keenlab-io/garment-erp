import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, createDb, documentSequence } from "@erp/db";
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
import { EventBusService } from "../../src/events/event-bus.service.js";
import { SequenceService } from "../../src/sequence/sequence.service.js";
import { CustomerService } from "../../src/sales/customer.service.js";
import { InvoiceService } from "../../src/sales/invoice.service.js";
import { PaymentService } from "../../src/sales/payment.service.js";
import { QuotationService } from "../../src/sales/quotation.service.js";
import { TotalsService } from "../../src/sales/totals.service.js";
import { VoidService } from "../../src/sales/void.service.js";

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
    uow = new UnitOfWork(conn.db);
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
