import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  plan,
  platformAuditLog,
  subscription,
  subscriptionInvoice,
  tenant,
} from "@erp/db";
import type { Money } from "@erp/contracts";
import { PasswordService } from "../../src/auth/password.service.js";
import {
  BusinessRuleError,
  StateConflictError,
} from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import type { PdfService } from "../../src/pdf/pdf.service.js";
import type { StorageService } from "../../src/storage/storage.service.js";
import { SubscriptionInvoiceService } from "../../src/platform/billing/subscription-invoice.service.js";
import { SubscriptionService } from "../../src/platform/billing/subscription.service.js";
import { PlatformAuditService } from "../../src/platform/platform-audit.service.js";
import { TenantProvisioningService } from "../../src/platform/tenant-provisioning.service.js";

const url = process.env.DATABASE_URL_TEST;
const m = (v: string) => v as Money;

// Gated on DATABASE_URL_TEST. M9 §3 — the vendor-side billing loop against real Postgres: one
// live subscription per tenant, SINV numbering from the control-plane sequence, the first-invoice
// shape (setup fee + negative up-front discount), the mark-paid amount guard rolling back cleanly,
// expiry → tenant READ_ONLY through M8's lifecycle, and a late renewal payment extending the term
// from the previous term_end while bringing the tenant back to ACTIVE — all platform-audited.
describe.skipIf(!url)("subscription billing (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let subscriptions: SubscriptionService;
  let invoices: SubscriptionInvoiceService;
  const run = randomUUID().slice(0, 8);
  const tenantId = randomUUID();
  const admin = null as unknown as string; // no platform_admin row needed: the FK is nullable
  let planId: string;
  let subId: string;

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    const uow = new UnitOfWork(conn.db);
    const audit = new PlatformAuditService(conn.db);
    const provisioning = new TenantProvisioningService(conn.db, uow, audit, new PasswordService());
    subscriptions = new SubscriptionService(conn.db, uow, audit, provisioning);
    const config = { get: () => undefined } as unknown as ConfigService;
    invoices = new SubscriptionInvoiceService(
      conn.db,
      uow,
      audit,
      subscriptions,
      {} as PdfService,
      {} as StorageService,
      config,
    );

    await conn.db
      .insert(plan)
      .values({ code: "FACTORY", includedSeats: 25, features: {} })
      .onConflictDoNothing();
    const [factory] = await conn.db.select({ id: plan.id }).from(plan).where(eq(plan.code, "FACTORY"));
    planId = (factory as { id: string }).id;
    await conn.db.insert(tenant).values({
      id: tenantId,
      slug: `billing-${run}`,
      name: "Billing tenant",
      kind: "CUSTOMER",
      planId,
    });
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("creates one live subscription per tenant (409 on a second)", async () => {
    const sub = await subscriptions.create(
      {
        tenant_id: tenantId,
        plan_id: planId,
        annual_fee: m("150000"),
        term_start: "2026-03-31T00:00:00.000Z",
      },
      admin,
    );
    subId = sub.id;
    expect(sub).toMatchObject({
      status: "ACTIVE",
      annual_fee: "150000.0000",
      term_end: "2027-03-31T00:00:00.000Z",
    });
    await expect(
      subscriptions.create(
        { tenant_id: tenantId, plan_id: planId, annual_fee: m("1"), term_start: sub.term_start },
        admin,
      ),
    ).rejects.toBeInstanceOf(StateConflictError);
  });

  it("issues the first invoice with SETUP_FEE and a negative UPFRONT_DISCOUNT, SINV-numbered", async () => {
    const inv = await invoices.issue(
      { subscription_id: subId, setup_fee: m("100000"), due_date: "2026-04-30" },
      admin,
    );
    expect(inv.number).toMatch(/^SINV-\d{4}-\d{4,}$/);
    expect(inv.lines.map((l) => [l.kind, l.amount])).toEqual([
      ["ANNUAL_FEE", "150000.0000"],
      ["SETUP_FEE", "100000.0000"],
      ["UPFRONT_DISCOUNT", "-25000.0000"],
    ]);
    expect(inv).toMatchObject({ total: "225000.0000", due_date: "2026-04-30", status: "ISSUED" });

    // A typo'd amount 422s and changes nothing.
    await expect(
      invoices.markPaid(
        inv.id,
        { paid_at: "2026-04-05T00:00:00.000Z", method: "BANK_TRANSFER", reference: "T1", amount: m("22500.00") },
        admin,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    const [still] = await conn.db
      .select({ status: subscriptionInvoice.status })
      .from(subscriptionInvoice)
      .where(eq(subscriptionInvoice.id, inv.id));
    expect(still?.status).toBe("ISSUED");

    const paid = await invoices.markPaid(
      inv.id,
      { paid_at: "2026-04-05T00:00:00.000Z", method: "PROMPTPAY", reference: "T1", amount: m("225000") },
      admin,
    );
    expect(paid).toMatchObject({ status: "PAID", paid_amount: "225000.0000", payment_method: "PROMPTPAY" });
    // The first invoice pays the term the subscription was created with — no extension.
    const [sub] = await conn.db.select().from(subscription).where(eq(subscription.id, subId));
    expect(sub?.termEnd.toISOString()).toBe("2027-03-31T00:00:00.000Z");

    await expect(invoices.void(inv.id, "nope", admin)).rejects.toBeInstanceOf(StateConflictError);
  });

  it("expiry sets the tenant READ_ONLY; a late renewal payment extends from term_end and restores ACTIVE", async () => {
    const renewal = await invoices.issue({ subscription_id: subId }, admin);
    expect(renewal.lines.map((l) => l.kind)).toEqual(["ANNUAL_FEE", "UPFRONT_DISCOUNT"]);

    await subscriptions.transition(subId, "IN_GRACE", "term ended");
    let [t] = await conn.db.select({ status: tenant.status }).from(tenant).where(eq(tenant.id, tenantId));
    expect(t?.status).toBe("ACTIVE");
    await subscriptions.transition(subId, "EXPIRED", "grace exhausted");
    [t] = await conn.db.select({ status: tenant.status }).from(tenant).where(eq(tenant.id, tenantId));
    expect(t?.status).toBe("READ_ONLY");

    await invoices.markPaid(
      renewal.id,
      { paid_at: "2027-04-10T00:00:00.000Z", method: "BANK_TRANSFER", reference: "T2", amount: m("125000") },
      admin,
    );
    const [sub] = await conn.db.select().from(subscription).where(eq(subscription.id, subId));
    expect(sub?.status).toBe("ACTIVE");
    expect(sub?.termEnd.toISOString()).toBe("2028-03-31T00:00:00.000Z");
    [t] = await conn.db.select({ status: tenant.status }).from(tenant).where(eq(tenant.id, tenantId));
    expect(t?.status).toBe("ACTIVE");

    const rows = await conn.db
      .select()
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.entityType, "subscription_invoice"),
          eq(platformAuditLog.entityId, renewal.id),
        ),
      );
    expect(rows.map((r) => r.action).sort()).toEqual(["CREATE", "UPDATE"]);
  });

  it("lists, voids and cancels — cancellation puts the tenant READ_ONLY", async () => {
    const extra = await invoices.issue({ subscription_id: subId, upfront_discount: m("0") }, admin);
    const voided = await invoices.void(extra.id, "issued by mistake", admin);
    expect(voided.status).toBe("VOID");
    expect(voided.voided_at).not.toBeNull();

    const page = await invoices.list({ limit: 2, tenant_id: tenantId });
    expect(page.data).toHaveLength(2);
    expect(page.next_cursor).not.toBeNull();
    const rest = await invoices.list({ limit: 2, tenant_id: tenantId, cursor: page.next_cursor as string });
    expect(rest.data).toHaveLength(1);

    const cancelled = await subscriptions.cancel(subId, "churned", admin);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelled_at).not.toBeNull();
    const [t] = await conn.db.select({ status: tenant.status }).from(tenant).where(eq(tenant.id, tenantId));
    expect(t?.status).toBe("READ_ONLY");
    expect((await subscriptions.getForTenant(tenantId)).status).toBe("CANCELLED");
  });
});
