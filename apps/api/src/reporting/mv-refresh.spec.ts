import { describe, expect, it } from "vitest";
import { INVENTORY_EVENTS } from "../inventory/inventory.events.js";
import { SALES_EVENTS } from "../sales/sales.events.js";
import { MV, viewsForEvent } from "./mv-refresh.js";

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
