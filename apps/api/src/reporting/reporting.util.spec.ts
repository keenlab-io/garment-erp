import { describe, expect, it } from "vitest";
import type { ReportResult } from "@erp/contracts";
import { isFinalAttempt, mapJobState, toCsv, toReportQuery } from "./reporting.util.js";

// Task 5.3 boundary + spec report-export: export status mapping and the digest-alert trigger.
describe("mapJobState", () => {
  it("maps completed → DONE and failed → FAILED", () => {
    expect(mapJobState("completed")).toBe("DONE");
    expect(mapJobState("failed")).toBe("FAILED");
  });

  it("maps active → RUNNING and everything else → PENDING", () => {
    expect(mapJobState("active")).toBe("RUNNING");
    expect(mapJobState("waiting")).toBe("PENDING");
    expect(mapJobState("delayed")).toBe("PENDING");
  });
});

describe("isFinalAttempt", () => {
  it("is true only on the last retry — where a digest send raises its in-app alert", () => {
    // 5 attempts: attemptsMade 0..3 are not final; 4 (the 5th attempt) is.
    expect(isFinalAttempt(0, 5)).toBe(false);
    expect(isFinalAttempt(3, 5)).toBe(false);
    expect(isFinalAttempt(4, 5)).toBe(true);
  });

  it("treats a single-attempt job as immediately final", () => {
    expect(isFinalAttempt(0, 1)).toBe(true);
  });
});

describe("toReportQuery", () => {
  it("keeps string params and stringifies numbers/booleans", () => {
    expect(toReportQuery({ from: "2026-01-01", months: 3, active: true })).toEqual({
      from: "2026-01-01",
      months: "3",
      active: "true",
    });
  });

  it("returns an empty query for undefined params", () => {
    expect(toReportQuery(undefined)).toEqual({});
  });
});

describe("toCsv", () => {
  it("renders header + rows and escapes commas/quotes", () => {
    const result: ReportResult = {
      columns: [
        { key: "name", label: "Name" },
        { key: "value", label: "Value" },
      ],
      rows: [
        { name: "Acme, Inc", value: "10" },
        { name: 'A "quoted" co', value: null },
      ],
      totals: {},
    };
    expect(toCsv(result).toString("utf8")).toBe(
      ['Name,Value', '"Acme, Inc",10', '"A ""quoted"" co",'].join("\n"),
    );
  });
});
