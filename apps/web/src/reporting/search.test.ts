import { describe, it, expect } from "vitest";
import { validateDashboardSearch, validateReportSearch } from "./search";

describe("validateDashboardSearch", () => {
  it("passes through a valid dimension/value pair", () => {
    expect(validateDashboardSearch({ dimension: "month", value: "2026-07" })).toEqual({
      dimension: "month",
      value: "2026-07",
    });
  });

  it("drops non-string values and unknown keys", () => {
    expect(validateDashboardSearch({ dimension: 5, other: "x" })).toEqual({});
  });

  it("returns an empty object for no search", () => {
    expect(validateDashboardSearch({})).toEqual({});
  });
});

describe("validateReportSearch", () => {
  it("passes through known and report-specific filter keys alike", () => {
    expect(
      validateReportSearch({ from: "2026-01-01", to: "2026-07-01", customer_id: "abc" }),
    ).toEqual({ from: "2026-01-01", to: "2026-07-01", customer_id: "abc" });
  });

  it("drops non-string values", () => {
    expect(validateReportSearch({ from: "2026-01-01", limit: 50 })).toEqual({
      from: "2026-01-01",
    });
  });
});
