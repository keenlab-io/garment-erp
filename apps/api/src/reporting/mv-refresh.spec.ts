import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { DomainEvent } from "../events/domain-event.js";
import { INVENTORY_EVENTS } from "../inventory/inventory.events.js";
import { SALES_EVENTS } from "../sales/sales.events.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { MV, mvRefreshJobId, viewsForEvent } from "./mv-refresh.js";
import { MvRefreshSubscriber } from "./mv-refresh.subscriber.js";

// Task 4.6 (design D10 / mv-refresh spec): each domain event maps to the targeted view(s) it
// invalidates — a stock event refreshes valuation + COGS; a sales event refreshes daily sales.
describe("viewsForEvent", () => {
  it("maps stock events to the valuation and COGS views", () => {
    for (const event of [
      INVENTORY_EVENTS.goodsReceiptPosted,
      INVENTORY_EVENTS.goodsIssued,
      INVENTORY_EVENTS.stockAdjusted,
      INVENTORY_EVENTS.backflushPosted,
    ]) {
      expect(viewsForEvent(event)).toEqual([MV.stockValuation, MV.cogsMonthly]);
    }
  });

  it("maps sales events to the daily-sales view", () => {
    expect(viewsForEvent(SALES_EVENTS.invoiceIssued)).toEqual([MV.salesDaily]);
    expect(viewsForEvent(SALES_EVENTS.paymentReceived)).toEqual([MV.salesDaily]);
  });

  it("maps an unrelated event to no views", () => {
    expect(viewsForEvent("some.other.event")).toEqual([]);
  });
});

// M7 design D8 — the debounce key is `(tenantId, view)`, so tenants never coalesce together.
describe("MvRefreshSubscriber tenant debounce", () => {
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";

  it("enqueues one tenant-stamped job per (tenant, view)", async () => {
    const add = vi.fn().mockResolvedValue({});
    const subscriber = new MvRefreshSubscriber(
      { add } as unknown as Queue,
      { get: () => 5_000 } as unknown as ConfigService,
    );
    const event = { event: SALES_EVENTS.invoiceIssued } as DomainEvent;
    await runWithTenant(A, "jwt", () => subscriber.onDomainEvent(event));
    await runWithTenant(B, "jwt", () => subscriber.onDomainEvent(event));

    expect(add.mock.calls.map((c) => [c[1], (c[2] as { jobId: string }).jobId])).toEqual([
      [{ view: MV.salesDaily, tenantId: A }, mvRefreshJobId(A, MV.salesDaily)],
      [{ view: MV.salesDaily, tenantId: B }, mvRefreshJobId(B, MV.salesDaily)],
    ]);
    // BullMQ rejects custom ids containing `:`.
    expect(mvRefreshJobId(A, MV.salesDaily)).not.toContain(":");
  });

  it("does not enqueue an unscoped refresh outside a tenant", async () => {
    const add = vi.fn().mockResolvedValue({});
    const subscriber = new MvRefreshSubscriber(
      { add } as unknown as Queue,
      { get: () => 5_000 } as unknown as ConfigService,
    );
    await subscriber.onDomainEvent({ event: SALES_EVENTS.invoiceIssued } as DomainEvent);
    expect(add).not.toHaveBeenCalled();
  });
});
