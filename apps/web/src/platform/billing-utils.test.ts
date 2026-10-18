import { describe, expect, it } from "vitest";
import { parseMoneyInput, parseOptionalMoney } from "./billing-utils";

describe("billing money input", () => {
  it("accepts plain non-negative decimals", () => {
    expect(parseMoneyInput("280000")).toBe("280000");
    expect(parseMoneyInput(" 1250.50 ")).toBe("1250.50");
  });
  it("rejects junk, negatives and >4 decimals", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNull();
    expect(parseMoneyInput("1.23456")).toBeNull();
    expect(parseMoneyInput("1,000")).toBeNull();
  });
  it("treats blank optional as omitted but invalid as null", () => {
    expect(parseOptionalMoney("")).toBeUndefined();
    expect(parseOptionalMoney("abc")).toBeNull();
  });
});
