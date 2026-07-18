import { describe, expect, it } from "vitest";
import type { Db } from "@erp/db";
import type { ReportQuery } from "@erp/contracts";
import { DashboardService } from "./dashboard.service.js";
import { ReportService } from "./report.service.js";
import { DASHBOARD_PANELS } from "./dashboard-catalog.js";

/** A DB stub whose `.execute` returns no rows — every panel still resolves its window. */
const stubDb = { execute: async () => [] } as unknown as Db;

function service(): DashboardService {
  return new DashboardService(new ReportService(stubDb));
}

// Task 5.1 (design D6): one dimension across panels. Filtering the sales dashboard to "this
// month" re-filters Top-Products and Sales-by-Customer to the same window.
describe("DashboardService cross-filter", () => {
  it("applies one resolved window to every panel of the dashboard", async () => {
    const result = await service().get("sales", {
      dimension: "month",
      value: "2026-03",
    } as ReportQuery);

    expect(result.panels.map((p) => p.key)).toEqual(DASHBOARD_PANELS.sales);
    for (const panel of result.panels) {
      expect(panel.data.window).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    }
  });

  it("re-filters sibling panels (top_products + by_customer) to the identical window", async () => {
    const result = await service().get("sales", {
      dimension: "month",
      value: "2026-03",
    } as ReportQuery);
    const top = result.panels.find((p) => p.key === "sales.top_products");
    const byCustomer = result.panels.find((p) => p.key === "sales.by_customer");
    expect(top?.data.window).toEqual(byCustomer?.data.window);
    expect(top?.data.window).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("rejects an unknown dashboard key", async () => {
    await expect(service().get("bogus", {} as ReportQuery)).rejects.toThrow();
  });
});
