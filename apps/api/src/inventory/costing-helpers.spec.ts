import { describe, expect, it } from "vitest";
import { allocate, divideMoney, divideQty, movingAverage } from "@erp/utils";

// Unit coverage for the M3 costing decimal helpers (tasks 2.1/2.2). Rounding is half-up at
// the money/qty scale, and `allocate` must preserve the total exactly.

describe("divideMoney / divideQty", () => {
  it("rounds half-up at money scale (4dp)", () => {
    expect(divideMoney("2", "3")).toBe("0.6667"); // 0.66666… → 0.6667
    expect(divideMoney("1", "8")).toBe("0.1250");
    expect(divideMoney("10", "4")).toBe("2.5000");
  });

  it("rounds half-up at qty scale (6dp)", () => {
    expect(divideQty("1", "3")).toBe("0.333333");
    expect(divideQty("20", "8")).toBe("2.500000");
  });

  it("throws on divide-by-zero", () => {
    expect(() => divideMoney("1", "0")).toThrow();
    expect(() => divideQty("1", "0")).toThrow();
  });
});

describe("movingAverage", () => {
  it("blends the running value with the incoming lot (spec §3.4)", () => {
    // (10·100 + 10·120) / 20 = 110
    expect(movingAverage("10", "100", "10", "120")).toBe("110.0000");
  });

  it("returns the incoming cost when there was no prior stock", () => {
    expect(movingAverage("0", "0", "10", "100")).toBe("100.0000");
  });

  it("returns the incoming cost when the resulting on-hand is zero", () => {
    expect(movingAverage("-10", "100", "10", "120")).toBe("120.0000");
  });
});

describe("allocate", () => {
  it("splits proportionally and preserves the total exactly", () => {
    const parts = allocate("100", ["2", "3"]);
    expect(parts).toEqual(["40.0000", "60.0000"]);
  });

  it("assigns the rounding remainder to the largest weight", () => {
    const parts = allocate("100", ["1", "1", "1"]);
    // 100/3 = 33.3333 each → 99.9999; +0.0001 remainder to the first (largest-tie) part.
    expect(parts).toEqual(["33.3334", "33.3333", "33.3333"]);
    expect(sum(parts)).toBe("100.0000");
  });

  it("puts the remainder on the genuinely largest weight", () => {
    const parts = allocate("10", ["1", "1", "8"]);
    expect(sum(parts)).toBe("10.0000");
    expect(parts[2]).toBe("8.0000");
  });

  it("splits evenly when all weights are zero", () => {
    expect(allocate("100", ["0", "0"])).toEqual(["50.0000", "50.0000"]);
  });

  it("returns an empty array for no weights", () => {
    expect(allocate("100", [])).toEqual([]);
  });
});

function sum(parts: string[]): string {
  return parts
    .reduce((acc, p) => acc + Number(p), 0)
    .toFixed(4);
}
