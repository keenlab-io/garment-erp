import { describe, expect, it } from "vitest";
import { ReportGroup } from "@erp/contracts";
import { isCostGatedGroup, reportKeyLabelKey, reportKeysByGroup } from "./report-catalog";

describe("reportKeyLabelKey", () => {
  it("underscores the dotted report key so it never nests as an i18next path", () => {
    expect(reportKeyLabelKey("stock.balance")).toBe("reporting:reportKeys.stock_balance");
    expect(reportKeyLabelKey("profit.margin_by_item")).toBe("reporting:reportKeys.profit_margin_by_item");
  });
});

describe("reportKeysByGroup", () => {
  it("buckets every catalog key under its report group, in catalog order", () => {
    const byGroup = reportKeysByGroup();
    expect(byGroup[ReportGroup.INVENTORY]).toEqual(["stock.balance", "stock.movement", "stock.low", "stock.dead"]);
    expect(byGroup[ReportGroup.TAX]).toEqual(["tax.pp30", "tax.aging"]);
    const total = Object.values(byGroup).reduce((sum, keys) => sum + keys.length, 0);
    expect(total).toBe(16);
  });
});

describe("isCostGatedGroup", () => {
  it("gates only cost and profit", () => {
    expect(isCostGatedGroup(ReportGroup.COST)).toBe(true);
    expect(isCostGatedGroup(ReportGroup.PROFIT)).toBe(true);
    expect(isCostGatedGroup(ReportGroup.INVENTORY)).toBe(false);
    expect(isCostGatedGroup(ReportGroup.SALES)).toBe(false);
    expect(isCostGatedGroup(ReportGroup.TAX)).toBe(false);
  });
});
