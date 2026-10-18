import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@erp/db";
import type { UnitOfWork } from "../../db/unit-of-work.service.js";
import type { DunningEvent } from "./dunning-schedule.js";
import { DunningService, type DunningNotifier } from "./dunning.service.js";
import type { SubscriptionInvoiceService } from "./subscription-invoice.service.js";
import type { SubscriptionRow, SubscriptionService } from "./subscription.service.js";

// M9 §4.1/4.2/4.4 — the sweep's per-subscription pass over a scripted drizzle fake. The
// subscription row lives in memory and the fake persists `dunning_events` writes back into it, so
// re-running the pass (a "restart") observes exactly what the previous pass recorded.

const SUB_ID = "22222222-2222-4222-8222-222222222222";
const TENANT = "33333333-3333-4333-8333-333333333333";
const TERM_END = new Date("2027-03-31T00:00:00.000Z");
const at = (days: number) => new Date(TERM_END.getTime() + days * 86_400_000);

function harness(initial: Partial<SubscriptionRow> = {}, existingInvoice: string | null = null) {
  const row = {
    id: SUB_ID,
    tenantId: TENANT,
    planId: "44444444-4444-4444-8444-444444444444",
    annualFee: "150000.0000",
    termStart: new Date("2026-03-31T00:00:00.000Z"),
    termEnd: TERM_END,
    status: "ACTIVE",
    dunningEvents: [],
    cancelledAt: null,
    ...initial,
  } as unknown as SubscriptionRow;

  const issued: string[] = [];
  // Each awaited select resolves by the table being read; updates persist dunning_events.
  const tx = {
    select: (cols?: Record<string, unknown>) => {
      const keys = Object.keys(cols ?? {});
      const result = keys.includes("name")
        ? [{ name: "Siam Garments" }]
        : keys.includes("total")
          ? issued.length
            ? [{ id: issued[issued.length - 1], number: "SINV-2027-0001", total: "125000.0000" }]
            : []
          : existingInvoice
            ? [{ id: existingInvoice }]
            : [];
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "where", "orderBy", "limit"]) chain[m] = () => chain;
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return chain;
    },
    update: () => ({
      set: (v: { dunningEvents?: DunningEvent[] }) => ({
        where: async () => {
          if (v.dunningEvents) row.dunningEvents = v.dunningEvents;
        },
      }),
    }),
  };

  const uow = { withTransaction: (fn: (t: unknown) => unknown) => fn(tx) } as unknown as UnitOfWork;
  const subscriptions = {
    lock: vi.fn(async () => ({ ...row })),
    transition: vi.fn(async (_id: string, to: SubscriptionRow["status"]) => {
      row.status = to;
    }),
  } as unknown as SubscriptionService;
  const issue = vi.fn(async () => {
    const id = `inv-${issued.length + 1}`;
    issued.push(id);
    return { id };
  });
  const invoices = {
    issue,
    vendorDetails: () => ({ promptpayId: "0105555000000" }),
  } as unknown as SubscriptionInvoiceService;
  const send = vi.fn(async () => undefined);
  const notifier = { send } as unknown as DunningNotifier;
  const config = { get: () => undefined } as unknown as ConfigService;
  const svc = new DunningService({} as Db, uow, subscriptions, invoices, notifier, config);
  const events = () => row.dunningEvents as DunningEvent[];
  return { svc, row, issue, send, subscriptions, events };
}

describe("DunningService.processOne", () => {
  it("auto-issues the renewal once at the lead window, as a renewal by the system", async () => {
    const h = harness();
    await h.svc.processOne(SUB_ID, at(-45));
    await h.svc.processOne(SUB_ID, at(-44));
    await h.svc.processOne(SUB_ID, at(-40));
    expect(h.issue).toHaveBeenCalledTimes(1);
    expect(h.issue).toHaveBeenCalledWith(
      { subscription_id: SUB_ID, due_date: "2027-03-31" },
      null,
      { renewal: true },
    );
    expect(h.events().filter((e) => e.kind === "RENEWAL_ISSUED")).toHaveLength(1);
  });

  it("does not issue a renewal when a live invoice already covers the next period", async () => {
    const h = harness({}, "inv-admin");
    await h.svc.processOne(SUB_ID, at(-30));
    expect(h.issue).not.toHaveBeenCalled();
    expect(h.events().find((e) => e.kind === "RENEWAL_ISSUED")?.invoice_id).toBe("inv-admin");
  });

  it("fires each reminder touch exactly once across repeated passes (restarts)", async () => {
    const h = harness();
    const clock = [-45, -30, -29, -14, -14, -7, -1, 0, 0.5];
    for (const d of clock) await h.svc.processOne(SUB_ID, at(d));
    const touches = h.events().filter((e) => e.kind === "REMINDER").map((e) => e.touch);
    expect(touches).toEqual(["T-30", "T-14", "T-7", "T0"]);
    // Delivery is deferred to commit (outside a real transaction it runs immediately).
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledTimes(4));
    const reminder = h.events().find((e) => e.touch === "T-14");
    expect(reminder).toMatchObject({ amount_due: "125000.00", invoice_id: "inv-1" });
  });

  it("degrades in stages: IN_GRACE past term_end, EXPIRED past grace, weekly + READ_ONLY touches once", async () => {
    const h = harness({ dunningEvents: [] });
    await h.svc.processOne(SUB_ID, at(3));
    expect(h.row.status).toBe("IN_GRACE");
    await h.svc.processOne(SUB_ID, at(7));
    await h.svc.processOne(SUB_ID, at(8));
    await h.svc.processOne(SUB_ID, at(16));
    expect(h.row.status).toBe("EXPIRED");
    await h.svc.processOne(SUB_ID, at(17));
    await h.svc.processOne(SUB_ID, at(30));

    expect(vi.mocked(h.subscriptions.transition).mock.calls.map((c) => c[1])).toEqual([
      "IN_GRACE",
      "EXPIRED",
    ]);
    // Sweep transitions are system actions (null admin) — and never SUSPENDED.
    for (const c of vi.mocked(h.subscriptions.transition).mock.calls) expect(c[3]).toBeNull();
    const touches = h.events().filter((e) => e.kind === "REMINDER").map((e) => e.touch);
    expect(touches).toEqual(["T0", "GRACE_W1", "READ_ONLY"]);
    expect(h.events().find((e) => e.touch === "GRACE_W1")?.read_only_on).toBe("2027-04-15");
    expect(h.issue).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh schedule once a payment moves term_end", async () => {
    const h = harness();
    await h.svc.processOne(SUB_ID, at(-14));
    h.row.termEnd = at(365);
    await h.svc.processOne(SUB_ID, at(365 - 14));
    const touches = h.events().filter((e) => e.kind === "REMINDER");
    expect(touches.map((e) => [e.touch, e.term_end])).toEqual([
      ["T-14", TERM_END.toISOString()],
      ["T-14", at(365).toISOString()],
    ]);
    expect(h.issue).toHaveBeenCalledTimes(2);
  });

  it("skips CANCELLED subscriptions entirely", async () => {
    const h = harness({ status: "CANCELLED" });
    const out = await h.svc.processOne(SUB_ID, at(20));
    expect(out).toEqual({ transitions: 0, renewalIssued: false, reminder: false });
    expect(h.issue).not.toHaveBeenCalled();
    expect(h.subscriptions.transition).not.toHaveBeenCalled();
    expect(h.events()).toEqual([]);
  });
});
