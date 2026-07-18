import { describe, expect, it } from "vitest";
import { requiredDashboardPermissions, requiredReportPermissions } from "./report-access.js";

// Task 5.4 (design D5): report RBAC with cost/profit dual-permission. Sales/inventory/tax reports
// need only their group's `report.<group>.view`; cost and profit additionally require
// `inventory.cost.view`, so a user with the group permission but not that code gets 403.
describe("requiredReportPermissions", () => {
  it("gates a sales report on report.sales.view only", () => {
    expect(requiredReportPermissions("sales.overview")).toEqual(["report.sales.view"]);
  });

  it("gates an inventory report on report.inventory.view only", () => {
    expect(requiredReportPermissions("stock.balance")).toEqual(["report.inventory.view"]);
  });

  it("gates a cost report on report.cost.view AND inventory.cost.view", () => {
    expect(requiredReportPermissions("cost.valuation")).toEqual([
      "report.cost.view",
      "inventory.cost.view",
    ]);
  });

  it("gates a profit report on report.profit.view AND inventory.cost.view", () => {
    expect(requiredReportPermissions("profit.margin_by_item")).toEqual([
      "report.profit.view",
      "inventory.cost.view",
    ]);
  });

  it("returns null for an unknown report key (→ 404, never a 403 leak)", () => {
    expect(requiredReportPermissions("bogus.key")).toBeNull();
  });
});

describe("requiredDashboardPermissions", () => {
  it("gates the sales dashboard on report.sales.view", () => {
    expect(requiredDashboardPermissions("sales")).toEqual(["report.sales.view"]);
  });

  it("gates the cost dashboard on report.cost.view AND inventory.cost.view", () => {
    expect(requiredDashboardPermissions("cost")).toEqual([
      "report.cost.view",
      "inventory.cost.view",
    ]);
  });

  it("returns null for an unknown dashboard key", () => {
    expect(requiredDashboardPermissions("bogus")).toBeNull();
  });
});
