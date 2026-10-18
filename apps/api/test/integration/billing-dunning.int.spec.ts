import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, plan, subscription, subscriptionInvoice, tenant } from "@erp/db";
import type { Money } from "@erp/contracts";
import { PasswordService } from "../../src/auth/password.service.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import type { PdfService } from "../../src/pdf/pdf.service.js";
import type { StorageService } from "../../src/storage/storage.service.js";
import type { DunningEvent } from "../../src/platform/billing/dunning-schedule.js";
import {
  DunningNotifier,
  DunningService,
} from "../../src/platform/billing/dunning.service.js";
import { SubscriptionInvoiceService } from "../../src/platform/billing/subscription-invoice.service.js";
import { SubscriptionService } from "../../src/platform/billing/subscription.service.js";
import { PlatformAuditService } from "../../src/platform/platform-audit.service.js";
import { TenantProvisioningService } from "../../src/platform/tenant-provisioning.service.js";

const url = process.env.DATABASE_URL_TEST;
const DAY_MS = 86_400_000;

// Gated on DATABASE_URL_TEST. M9 §4.4 — the dunning sweep against real Postgres, re-instantiated
// between passes to model worker restarts: exactly one renewal invoice per term, each reminder
// touch recorded once, staged ACTIVE → IN_GRACE → EXPIRED with the tenant READ_ONLY only after
// grace (never SUSPENDED), and mark-paid restoring ACTIVE for both.
describe.skipIf(!url)("billing dunning sweep (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let subscriptions: SubscriptionService;
  let invoices: SubscriptionInvoiceService;
  const sent: string[] = [];
  const run = randomUUID().slice(0, 8);
  const tenantId = randomUUID();
  let subId: string;
  const termEnd = new Date("2027-03-31T00:00:00.000Z");
  const at = (days: number) => new Date(termEnd.getTime() + days * DAY_MS);

  const config = {
    get: (key: string) =>
      ({ BILLING_GRACE_DAYS: 15, BILLING_RENEWAL_LEAD_DAYS: 45 })[key] as never,
  } as unknown as ConfigService;

  /** A fresh service graph per pass — nothing survives in memory between "restarts". */
  function freshSweep(): DunningService {
    const uow = new UnitOfWork(conn.db);
    const audit = new PlatformAuditService(conn.db);
    const provisioning = new TenantProvisioningService(conn.db, uow, audit, new PasswordService());
    subscriptions = new SubscriptionService(conn.db, uow, audit, provisioning);
    invoices = new SubscriptionInvoiceService(
      conn.db,
      uow,
      audit,
      subscriptions,
      {} as PdfService,
      {} as StorageService,
      config,
    );
    const notifier = new DunningNotifier();
    vi.spyOn(notifier, "send").mockImplementation(async (r) => {
      sent.push(r.touch);
    });
    return new DunningService(conn.db, uow, subscriptions, invoices, notifier, config);
  }

  const subRow = async () =>
    (await conn.db.select().from(subscription).where(eq(subscription.id, subId)))[0];
  const tenantStatus = async () =>
    (await conn.db.select({ s: tenant.status }).from(tenant).where(eq(tenant.id, tenantId)))[0]?.s;
  const invoiceRows = () =>
    conn.db.select().from(subscriptionInvoice).where(eq(subscriptionInvoice.subscriptionId, subId));

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    await conn.db
      .insert(plan)
      .values({ code: "FACTORY", includedSeats: 25, features: {} })
      .onConflictDoNothing();
    const [factory] = await conn.db.select({ id: plan.id }).from(plan).where(eq(plan.code, "FACTORY"));
    await conn.db.insert(tenant).values({
      id: tenantId,
      slug: `dunning-${run}`,
      name: "Dunning tenant",
      kind: "CUSTOMER",
      planId: (factory as { id: string }).id,
    });
    freshSweep();
    const sub = await subscriptions.create(
      {
        tenant_id: tenantId,
        plan_id: (factory as { id: string }).id,
        annual_fee: "150000" as Money,
        term_start: "2026-03-31T00:00:00.000Z",
      },
      null as unknown as string,
    );
    subId = sub.id;
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("issues one renewal invoice and one reminder per touchpoint across restarts", async () => {
    for (const d of [-60, -45, -45, -44, -30, -30, -20, -14, -14, -7, -7, -1]) {
      await freshSweep().processOne(subId, at(d));
    }
    const rows = await invoiceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "ISSUED", dueDate: "2027-03-31", createdBy: null });
    expect(rows[0]?.periodStart?.toISOString()).toBe(termEnd.toISOString());
    expect((rows[0]?.lines as { kind: string }[]).map((l) => l.kind)).not.toContain("SETUP_FEE");

    const events = (await subRow())?.dunningEvents as DunningEvent[];
    expect(events.filter((e) => e.kind === "RENEWAL_ISSUED")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "REMINDER").map((e) => e.touch)).toEqual([
      "T-30",
      "T-14",
      "T-7",
    ]);
    expect(sent).toEqual(["T-30", "T-14", "T-7"]);
  });

  it("degrades IN_GRACE (tenant writable) then EXPIRED (tenant READ_ONLY), never re-sending", async () => {
    await freshSweep().processOne(subId, at(3));
    expect((await subRow())?.status).toBe("IN_GRACE");
    expect(await tenantStatus()).toBe("ACTIVE");

    for (const d of [7, 7, 16, 16, 30]) await freshSweep().processOne(subId, at(d));
    expect((await subRow())?.status).toBe("EXPIRED");
    expect(await tenantStatus()).toBe("READ_ONLY");
    expect(await invoiceRows()).toHaveLength(1);
    expect(sent).toEqual(["T-30", "T-14", "T-7", "T0", "GRACE_W1", "READ_ONLY"]);
  });

  it("mark-paid restores ACTIVE; the next term starts a fresh schedule", async () => {
    const [renewal] = await invoiceRows();
    await invoices.markPaid(
      renewal?.id as string,
      {
        paid_at: "2027-04-20T00:00:00.000Z",
        method: "BANK_TRANSFER",
        reference: "T-late",
        amount: renewal?.total as Money,
      },
      null as unknown as string,
    );
    expect((await subRow())?.status).toBe("ACTIVE");
    expect((await subRow())?.termEnd.toISOString()).toBe("2028-03-31T00:00:00.000Z");
    expect(await tenantStatus()).toBe("ACTIVE");

    // Same clock as before the payment: nothing is due for the new term yet.
    const out = await freshSweep().processOne(subId, at(30));
    expect(out).toEqual({ transitions: 0, renewalIssued: false, reminder: false });
  });
});
