import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@erp/db";
import type { TenantStatusUpdate } from "@erp/contracts";
import { BusinessRuleError, StateConflictError } from "../../common/errors/app-exception.js";
import type { UnitOfWork } from "../../db/unit-of-work.service.js";
import type { PdfService } from "../../pdf/pdf.service.js";
import type { StorageService } from "../../storage/storage.service.js";
import type { PlatformAuditEntry, PlatformAuditService } from "../platform-audit.service.js";
import type { TenantProvisioningService } from "../tenant-provisioning.service.js";
import { SubscriptionInvoiceService } from "./subscription-invoice.service.js";
import {
  assertSubscriptionTransition,
  SubscriptionService,
  type SubscriptionRow,
} from "./subscription.service.js";

// M9 §3.1/3.2/3.3 — subscription lifecycle side effects and the invoice flows, over a scripted
// drizzle fake: every awaited query consumes the next scripted result, and every `.set()` /
// `.values()` payload is recorded so a test can assert exactly what was (not) written.

const ADMIN = "55555555-5555-4555-8555-555555555555";
const TENANT = "33333333-3333-4333-8333-333333333333";
const SUB_ID = "22222222-2222-4222-8222-222222222222";
const INV_ID = "11111111-1111-4111-8111-111111111111";

function fakeDb(results: unknown[][]) {
  const writes: { op: string; payload: unknown }[] = [];
  const query = (op: string): unknown => {
    const chain: unknown = new Proxy(() => undefined, {
      get(_t, prop) {
        if (prop === "then") {
          const next = results.shift() ?? [];
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(next).then(res, rej);
        }
        return (...args: unknown[]) => {
          if (prop === "set" || prop === "values") writes.push({ op, payload: args[0] });
          return chain;
        };
      },
    });
    return chain;
  };
  const db = {
    select: () => query("select"),
    update: () => query("update"),
    insert: () => query("insert"),
    execute: async () => results.shift() ?? [],
  };
  return { db, writes };
}

function subRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: SUB_ID,
    createdAt: new Date("2026-03-31T00:00:00Z"),
    updatedAt: new Date("2026-03-31T00:00:00Z"),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    tenantId: TENANT,
    planId: "44444444-4444-4444-8444-444444444444",
    annualFee: "150000.0000",
    termStart: new Date("2026-03-31T00:00:00Z"),
    termEnd: new Date("2027-03-31T00:00:00Z"),
    status: "ACTIVE",
    dunningEvents: [],
    cancelledAt: null,
    version: 0,
    ...overrides,
  };
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INV_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    number: "SINV-2027-0002",
    subscriptionId: SUB_ID,
    tenantId: TENANT,
    lines: [{ kind: "ANNUAL_FEE", description: "Annual subscription fee", amount: "150000.0000" }],
    subtotal: "150000.0000",
    total: "150000.0000",
    status: "ISSUED",
    issuedAt: new Date("2027-02-14T00:00:00Z"),
    dueDate: null,
    periodStart: new Date("2027-03-31T00:00:00Z"),
    periodEnd: new Date("2028-03-31T00:00:00Z"),
    paidAt: null,
    paidMethod: null,
    paidReference: null,
    paidAmount: null,
    voidedAt: null,
    version: 0,
    ...overrides,
  };
}

function setup(results: unknown[][], env: Record<string, string> = {}) {
  const { db, writes } = fakeDb(results);
  const uow = {
    withTransaction: (fn: (tx: unknown) => unknown) => fn(db),
  } as unknown as UnitOfWork;
  const audits: PlatformAuditEntry[] = [];
  const audit = {
    append: async (e: PlatformAuditEntry) => {
      audits.push(e);
    },
  } as unknown as PlatformAuditService;
  const statusCalls: { id: string; update: TenantStatusUpdate; admin: string | null }[] = [];
  const tenants = {
    setStatus: async (id: string, update: TenantStatusUpdate, admin: string | null) => {
      statusCalls.push({ id, update, admin });
    },
    onTenantProvisioned: vi.fn(),
  } as unknown as TenantProvisioningService;
  const subscriptions = new SubscriptionService(db as unknown as Db, uow, audit, tenants);
  const rendered: string[] = [];
  const pdf = {
    renderHtml: async (html: string) => {
      rendered.push(html);
      return Buffer.from("%PDF");
    },
  } as unknown as PdfService;
  const stored: unknown[] = [];
  const storage = {
    platformKey: (k: string) => ({ platformKey: `platform/${k}` }),
    put: async (key: unknown) => {
      stored.push(key);
    },
    getSignedUrl: async (key: { platformKey: string }) => `https://s3.test/${key.platformKey}`,
  } as unknown as StorageService;
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const invoices = new SubscriptionInvoiceService(
    db as unknown as Db,
    uow,
    audit,
    subscriptions,
    pdf,
    storage,
    config,
  );
  return { subscriptions, invoices, writes, audits, statusCalls, rendered, stored, tenants };
}

describe("subscription state machine (design D3)", () => {
  it("never allows leaving CANCELLED and refuses IN_GRACE → IN_GRACE", () => {
    expect(() => assertSubscriptionTransition("CANCELLED", "ACTIVE")).toThrow(StateConflictError);
    expect(() => assertSubscriptionTransition("ACTIVE", "EXPIRED")).toThrow(StateConflictError);
    expect(() => assertSubscriptionTransition("IN_GRACE", "EXPIRED")).not.toThrow();
    expect(() => assertSubscriptionTransition("EXPIRED", "ACTIVE")).not.toThrow();
  });
});

describe("SubscriptionService", () => {
  it("registers the create-at-provisioning hook on init", () => {
    const { subscriptions, tenants } = setup([]);
    subscriptions.onModuleInit();
    expect(tenants.onTenantProvisioned).toHaveBeenCalledOnce();
  });

  it("creates no subscription at provisioning for demo tenants or plans quoted per deal", async () => {
    const { subscriptions, writes } = setup([[{ annualFeeMin: null }]]);
    const planId = "44444444-4444-4444-8444-444444444444";
    expect(
      await subscriptions.createAtProvisioning({ tenantId: TENANT, kind: "DEMO_SANDBOX", planId }, null),
    ).toBeNull();
    expect(
      await subscriptions.createAtProvisioning({ tenantId: TENANT, kind: "CUSTOMER", planId }, null),
    ).toBeNull();
    expect(writes).toEqual([]);
  });

  it("creates a one-year subscription at the plan list price when provisioning a customer", async () => {
    const created = subRow();
    const { subscriptions, writes, audits } = setup([
      [{ annualFeeMin: "120000.0000" }], // plan list price
      [], // no live subscription
      [created], // insert … returning
    ]);
    const out = await subscriptions.createAtProvisioning(
      { tenantId: TENANT, kind: "CUSTOMER", planId: created.planId },
      ADMIN,
    );
    expect(out?.id).toBe(SUB_ID);
    const values = writes[0]?.payload as { annualFee: string; termStart: Date; termEnd: Date };
    expect(values.annualFee).toBe("120000.0000");
    expect(values.termEnd.getUTCFullYear() - values.termStart.getUTCFullYear()).toBe(1);
    expect(audits.map((a) => [a.action, a.entityType])).toEqual([["CREATE", "subscription"]]);
  });

  it("rejects a second live subscription with 409", async () => {
    const { subscriptions, writes } = setup([
      [{ kind: "CUSTOMER" }],
      [{ id: "plan" }],
      [{ id: SUB_ID }], // a live one exists
    ]);
    await expect(
      subscriptions.create(
        {
          tenant_id: TENANT,
          plan_id: "44444444-4444-4444-8444-444444444444",
          annual_fee: "150000" as never,
          term_start: "2026-04-01T00:00:00.000Z",
        },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(StateConflictError);
    expect(writes).toEqual([]);
  });

  it("cancel moves the tenant ACTIVE → READ_ONLY through M8's lifecycle service", async () => {
    const { subscriptions, statusCalls, audits } = setup([
      [subRow()], // lock
      [subRow({ status: "CANCELLED", cancelledAt: new Date() })], // update … returning
      [{ status: "ACTIVE" }], // tenant status
    ]);
    const out = await subscriptions.cancel(SUB_ID, "churned", ADMIN);
    expect(out.status).toBe("CANCELLED");
    expect(statusCalls).toEqual([
      { id: TENANT, update: { status: "READ_ONLY", reason: "Subscription cancelled: churned" }, admin: ADMIN },
    ]);
    expect(audits[0]).toMatchObject({ entityType: "subscription", reason: "churned" });
  });

  it("expiry enters READ_ONLY but never touches a SUSPENDED tenant", async () => {
    const { subscriptions, statusCalls } = setup([
      [subRow({ status: "IN_GRACE" })],
      [subRow({ status: "EXPIRED" })],
      [{ status: "SUSPENDED" }],
    ]);
    await subscriptions.transition(SUB_ID, "EXPIRED", "grace exhausted");
    expect(statusCalls).toEqual([]);
  });

  it("IN_GRACE leaves the tenant fully ACTIVE", async () => {
    const { subscriptions, statusCalls } = setup([[subRow()], [subRow({ status: "IN_GRACE" })]]);
    await subscriptions.transition(SUB_ID, "IN_GRACE", "term ended");
    expect(statusCalls).toEqual([]);
  });
});

describe("SubscriptionInvoiceService.issue", () => {
  it("numbers from the SINV sequence and adds SETUP_FEE only on the first invoice", async () => {
    const { invoices, writes } = setup([
      [subRow()], // lock subscription
      [], // no prior non-void invoice → first
      [{ seq: "7" }], // nextval
      [invoiceRow({ number: "SINV-2026-0007" })], // insert … returning
    ]);
    await invoices.issue({ subscription_id: SUB_ID, setup_fee: "100000" as never }, ADMIN);
    const values = writes[0]?.payload as {
      number: string;
      lines: { kind: string; amount: string }[];
      total: string;
      periodEnd: Date;
    };
    expect(values.number).toMatch(/^SINV-\d{4}-0007$/);
    expect(values.lines.map((l) => [l.kind, l.amount])).toEqual([
      ["ANNUAL_FEE", "150000.0000"],
      ["SETUP_FEE", "100000.0000"],
      ["UPFRONT_DISCOUNT", "-25000.0000"],
    ]);
    expect(values.total).toBe("225000.0000");
    expect(values.periodEnd.toISOString()).toBe("2027-03-31T00:00:00.000Z");
  });

  it("bills a renewal from term_end with no SETUP_FEE", async () => {
    const { invoices, writes } = setup([
      [subRow()],
      [{ id: "prior" }],
      [{ seq: "8" }],
      [invoiceRow()],
    ]);
    await invoices.issue({ subscription_id: SUB_ID, setup_fee: "100000" as never }, ADMIN);
    const values = writes[0]?.payload as {
      lines: { kind: string }[];
      periodStart: Date;
      periodEnd: Date;
    };
    expect(values.lines.map((l) => l.kind)).toEqual(["ANNUAL_FEE", "UPFRONT_DISCOUNT"]);
    expect(values.periodStart.toISOString()).toBe("2027-03-31T00:00:00.000Z");
    expect(values.periodEnd.toISOString()).toBe("2028-03-31T00:00:00.000Z");
  });

  it("refuses to invoice a cancelled subscription", async () => {
    const { invoices } = setup([[subRow({ status: "CANCELLED" })]]);
    await expect(invoices.issue({ subscription_id: SUB_ID }, ADMIN)).rejects.toBeInstanceOf(
      StateConflictError,
    );
  });
});

describe("SubscriptionInvoiceService.markPaid", () => {
  const body = {
    paid_at: "2027-04-10T03:00:00.000Z",
    method: "BANK_TRANSFER" as const,
    reference: "KBANK-123",
    amount: "150000.00" as never,
  };

  it("422s a typo'd amount and writes nothing", async () => {
    const { invoices, writes, audits } = setup([[invoiceRow()]]);
    await expect(
      invoices.markPaid(INV_ID, { ...body, amount: "15000.00" as never }, ADMIN),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(writes).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("extends a late renewal from the previous term_end, restores ACTIVE, leaves READ_ONLY", async () => {
    const expired = subRow({ status: "EXPIRED" });
    const { invoices, writes, audits, statusCalls } = setup([
      [invoiceRow()], // lock invoice
      [expired], // lock subscription
      [subRow({ status: "ACTIVE", termEnd: new Date("2028-03-31T00:00:00Z") })], // sub update
      [{ status: "READ_ONLY" }], // tenant status
      [
        invoiceRow({
          status: "PAID",
          paidAt: new Date(body.paid_at),
          paidMethod: "BANK_TRANSFER",
          paidReference: "KBANK-123",
          paidAmount: "150000.0000",
        }),
      ],
    ]);
    const out = await invoices.markPaid(INV_ID, body, ADMIN);
    expect(out.status).toBe("PAID");

    const subUpdate = writes[0]?.payload as { status: string; termEnd: Date };
    expect(subUpdate.status).toBe("ACTIVE");
    expect(subUpdate.termEnd.toISOString()).toBe("2028-03-31T00:00:00.000Z");
    expect(writes[1]?.payload).toMatchObject({ status: "PAID", paidAmount: "150000.0000" });
    expect(statusCalls).toEqual([
      { id: TENANT, update: { status: "ACTIVE", reason: "Subscription invoice paid" }, admin: ADMIN },
    ]);
    // One platform_audit_log row carries the whole before/after.
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entityType: "subscription_invoice",
      before: {
        invoice: { status: "ISSUED" },
        subscription: { status: "EXPIRED", term_end: "2027-03-31T00:00:00.000Z" },
      },
      after: {
        invoice: { status: "PAID" },
        subscription: { status: "ACTIVE", term_end: "2028-03-31T00:00:00.000Z" },
      },
    });
  });

  it("accepts a partial payment only with accept_partial", async () => {
    const { invoices } = setup([
      [invoiceRow()],
      [subRow()],
      [subRow()],
      [invoiceRow({ status: "PAID", paidAmount: "100000.0000" })],
    ]);
    const out = await invoices.markPaid(
      INV_ID,
      { ...body, amount: "100000" as never, accept_partial: true },
      ADMIN,
    );
    expect(out.status).toBe("PAID");
  });

  it("refuses to mark a VOID or PAID invoice paid", async () => {
    const { invoices } = setup([[invoiceRow({ status: "VOID" })]]);
    await expect(invoices.markPaid(INV_ID, body, ADMIN)).rejects.toBeInstanceOf(StateConflictError);
  });
});

describe("SubscriptionInvoiceService.void", () => {
  it("voids an unpaid invoice with an audited reason", async () => {
    const { invoices, audits } = setup([
      [invoiceRow()],
      [invoiceRow({ status: "VOID", voidedAt: new Date() })],
    ]);
    const out = await invoices.void(INV_ID, "wrong fee", ADMIN);
    expect(out.status).toBe("VOID");
    expect(audits[0]).toMatchObject({ action: "VOID", reason: "wrong fee" });
  });

  it("refuses to void a PAID invoice", async () => {
    const { invoices, writes } = setup([[invoiceRow({ status: "PAID" })]]);
    await expect(invoices.void(INV_ID, "oops", ADMIN)).rejects.toBeInstanceOf(StateConflictError);
    expect(writes).toEqual([]);
  });
});

describe("SubscriptionInvoiceService.pdfUrl", () => {
  it("renders with the vendor's PLATFORM_PROMPTPAY_ID — never the tenant PROMPTPAY_ID", async () => {
    const { invoices, rendered, stored } = setup(
      [[{ invoice: invoiceRow(), tenantName: "Siam Garments" }]],
      {
        PLATFORM_PROMPTPAY_ID: "0105561234567",
        PROMPTPAY_ID: "0812345678",
        PLATFORM_BANK_NAME: "KBank",
      },
    );
    const out = await invoices.pdfUrl(INV_ID);
    expect(out.url).toBe("https://s3.test/platform/billing/subscription-invoices/SINV-2027-0002.pdf");
    expect(stored).toEqual([
      { platformKey: "platform/billing/subscription-invoices/SINV-2027-0002.pdf" },
    ]);
    const html = rendered[0] ?? "";
    expect(html).toContain("PromptPay QR");
    expect(html).toContain("0105561234567"); // the QR payload carries the vendor tax id
    expect(html).not.toContain("812345678");
    expect(html).toContain("KBank");
  });
});
