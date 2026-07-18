import { describe, expect, it } from "vitest";
import type { ReportQuery } from "@erp/contracts";
import { resolveWindow } from "./report-window.js";

// Task 5.1 (design D6): the cross-filter window. A `(dimension, value)` pair resolves to a
// single deterministic `[from, to]` range so every panel of one dashboard filters identically.
describe("resolveWindow", () => {
  it("expands dimension=month/value=YYYY-MM to the whole calendar month", () => {
    expect(resolveWindow({ dimension: "month", value: "2026-03" } as ReportQuery)).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("handles February leap/non-leap month length", () => {
    expect(resolveWindow({ dimension: "month", value: "2026-02" } as ReportQuery).to).toBe(
      "2026-02-28",
    );
    expect(resolveWindow({ dimension: "month", value: "2024-02" } as ReportQuery).to).toBe(
      "2024-02-29",
    );
  });

  it("pins dimension=day/value=YYYY-MM-DD to a single day", () => {
    expect(resolveWindow({ dimension: "day", value: "2026-03-15" } as ReportQuery)).toEqual({
      from: "2026-03-15",
      to: "2026-03-15",
    });
  });

  it("falls back to explicit from/to when no dimension is given", () => {
    expect(
      resolveWindow({ from: "2026-01-01", to: "2026-01-31" } as ReportQuery),
    ).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("is deterministic — identical input yields an identical window", () => {
    const q = { dimension: "month", value: "2026-03" } as ReportQuery;
    expect(resolveWindow(q)).toEqual(resolveWindow(q));
  });
});
