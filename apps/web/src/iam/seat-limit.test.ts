import { describe, it, expect } from "vitest";
import { parseSeatLimitError } from "./seat-limit";

const seatError = {
  status: 422,
  body: {
    code: "BUSINESS_RULE",
    message: "Seat limit reached",
    details: [
      { field: "seats", issue: "seat limit reached" },
      { field: "cap", issue: "8" },
      { field: "counted", issue: "8" },
      { field: "exempt", issue: "3" },
      { field: "user:somchai", issue: "would occupy a seat" },
    ],
  },
};

describe("parseSeatLimitError", () => {
  it("extracts cap, counted, exempt and the would-be seat holders", () => {
    expect(parseSeatLimitError(seatError)).toEqual({ cap: 8, counted: 8, exempt: 3, users: ["somchai"] });
  });

  it("ignores other business-rule 422s", () => {
    expect(
      parseSeatLimitError({
        status: 422,
        body: { code: "BUSINESS_RULE", details: [{ field: "qty", issue: "insufficient stock" }] },
      }),
    ).toBeNull();
  });

  it("ignores non-422 and non-error values", () => {
    expect(parseSeatLimitError({ ...seatError, status: 403 })).toBeNull();
    expect(parseSeatLimitError(null)).toBeNull();
    expect(parseSeatLimitError(new Error("boom"))).toBeNull();
  });
});
