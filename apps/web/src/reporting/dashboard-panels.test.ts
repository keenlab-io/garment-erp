import { describe, expect, it } from "vitest";
import {
  dimensionFilterValue,
  panelChartConfig,
  panelHeadlineTotal,
  panelResult,
} from "./dashboard-panels";

describe("panelChartConfig", () => {
  it("derives a day-dimension line chart from a daily report", () => {
    const columns = [
      { key: "d", label: "Date" },
      { key: "sales", label: "Sales" },
      { key: "vat", label: "VAT" },
    ];
    const rows = [{ d: "2026-01-01", sales: "100.0000", vat: "7.0000" }];

    expect(panelChartConfig(columns, rows)).toEqual({
      kind: "line",
      xKey: "d",
      series: [
        { key: "sales", label: "Sales" },
        { key: "vat", label: "VAT" },
      ],
      dimension: "day",
    });
  });

  it("derives a bar chart with no dimension for a non-date category", () => {
    const columns = [
      { key: "customer_id", label: "Customer" },
      { key: "sales", label: "Sales" },
    ];
    const rows = [{ customer_id: "c1", sales: "50.0000" }];

    expect(panelChartConfig(columns, rows)).toEqual({
      kind: "bar",
      xKey: "customer_id",
      series: [{ key: "sales", label: "Sales" }],
      dimension: undefined,
    });
  });

  it("returns undefined when no column carries a numeric value", () => {
    const columns = [
      { key: "status", label: "Status" },
      { key: "note", label: "Note" },
    ];
    const rows = [{ status: "OPEN", note: "n/a" }];

    expect(panelChartConfig(columns, rows)).toBeUndefined();
  });

  it("returns undefined for an empty report (no columns)", () => {
    expect(panelChartConfig([], [])).toBeUndefined();
  });
});

describe("dimensionFilterValue", () => {
  it("passes a day value through unchanged", () => {
    expect(dimensionFilterValue("day", "2026-01-15")).toBe("2026-01-15");
  });

  it("truncates a date cell to YYYY-MM for a month dimension", () => {
    expect(dimensionFilterValue("month", "2026-01-01")).toBe("2026-01");
  });
});

describe("panelHeadlineTotal", () => {
  it("picks the first column with a populated total", () => {
    const columns = [
      { key: "item_id", label: "Item" },
      { key: "value", label: "Value" },
    ];
    const totals = { value: "1234.5678" };

    expect(panelHeadlineTotal(columns, totals)).toEqual({
      key: "value",
      label: "Value",
      value: "1234.5678",
    });
  });

  it("returns undefined when totals has nothing for the panel's columns", () => {
    const columns = [{ key: "item_id", label: "Item" }];
    expect(panelHeadlineTotal(columns, {})).toBeUndefined();
  });
});

describe("panelResult", () => {
  it("passes through the dashboard panel's data as the report-result shape", () => {
    const panel = {
      key: "sales.overview",
      data: { window: { from: "2026-01-01" }, columns: [], rows: [], totals: {} },
    };
    expect(panelResult(panel)).toEqual(panel.data);
  });
});
