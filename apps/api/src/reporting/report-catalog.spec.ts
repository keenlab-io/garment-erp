import { describe, expect, it } from "vitest";
import type { ReportQuery } from "@erp/contracts";
import { REPORT_BUILDERS, type ReportExecutor } from "./report-catalog.js";

/** A stub executor whose `.execute` returns fixed rows — no database needed. */
function stubExecutor(rows: Record<string, unknown>[]): ReportExecutor {
  return { execute: async () => rows } as unknown as ReportExecutor;
}

const VALUATION_ROWS = [
  { item_id: "a", warehouse_id: "w1", qty_on_hand: "2.000000", avg_cost: "10.0000", value: "20.0000" },
  { item_id: "b", warehouse_id: "w1", qty_on_hand: "3.000000", avg_cost: "5.0000", value: "15.0000" },
  { item_id: "c", warehouse_id: "w2", qty_on_hand: "1.000000", avg_cost: "7.5000", value: "7.5000" },
];

// Task 5.2 (design D11): the valuation reconciliation invariant. `cost.valuation`'s total equals
// Σ mv_stock_valuation.value, item-by-item — the correctness anchor for the cost/profit layer.
describe("cost.valuation report", () => {
  it("totals value as the sum over every item/warehouse row", async () => {
    const result = await REPORT_BUILDERS["cost.valuation"]!(
      stubExecutor(VALUATION_ROWS),
      {},
      {} as ReportQuery,
    );
    expect(result.rows).toHaveLength(3);
    expect(result.totals.value).toBe("42.5000"); // 20 + 15 + 7.5
  });

  it("reconciles to the same total as the stock.balance report (shared MV builder)", async () => {
    const valuation = await REPORT_BUILDERS["cost.valuation"]!(
      stubExecutor(VALUATION_ROWS),
      {},
      {} as ReportQuery,
    );
    const balance = await REPORT_BUILDERS["stock.balance"]!(
      stubExecutor(VALUATION_ROWS),
      {},
      {} as ReportQuery,
    );
    expect(valuation.totals.value).toBe(balance.totals.value);
  });

  it("reports a zero total for an empty view", async () => {
    const result = await REPORT_BUILDERS["cost.valuation"]!(
      stubExecutor([]),
      {},
      {} as ReportQuery,
    );
    expect(result.rows).toEqual([]);
    expect(result.totals.value).toBe("0.0000");
  });
});

describe("sales reports", () => {
  it("sums sales and vat totals over the returned rows", async () => {
    const rows = [
      { d: "2026-03-01", sales: "100.0000", vat: "7.0000" },
      { d: "2026-03-02", sales: "50.0000", vat: "3.5000" },
    ];
    const result = await REPORT_BUILDERS["sales.overview"]!(
      stubExecutor(rows),
      { from: "2026-03-01", to: "2026-03-31" },
      {} as ReportQuery,
    );
    expect(result.totals).toEqual({ sales: "150.0000", vat: "10.5000" });
  });
});
