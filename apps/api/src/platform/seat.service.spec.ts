import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import { assertCapacity, type SeatHolder } from "./seat.service.js";

// M8 §5.2 — the hard seat cap (design D3/D4): only a mutation that newly counts someone can be
// refused, and the 422 names the cap, the totals, and every user it would have promoted.

const holder = (id: string, counted: boolean): SeatHolder => ({ id, username: id, counted });
const counted = (n: number, prefix = "u") =>
  Array.from({ length: n }, (_, i) => holder(`${prefix}${i}`, true));
const ids = (hs: SeatHolder[]) => new Set(hs.map((h) => h.id));

describe("assertCapacity", () => {
  it("refuses the ninth counted Workshop user with cap and counts in the details", () => {
    const before = counted(8);
    const after = [...before, holder("u8", true), holder("scanner", false)];

    const err = (() => {
      try {
        assertCapacity(8, ids(before), after);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect((err as BusinessRuleError).details).toEqual([
      { field: "seats", issue: "seat limit reached" },
      { field: "cap", issue: "8" },
      { field: "counted", issue: "8" },
      { field: "exempt", issue: "1" },
      { field: "user:u8", issue: "would occupy a seat" },
    ]);
  });

  it("lets scan-only floor accounts in without limit", () => {
    const before = counted(8);
    const scanners = Array.from({ length: 20 }, (_, i) => holder(`s${i}`, false));
    expect(() => assertCapacity(8, ids(before), [...before, ...scanners])).not.toThrow();
  });

  it("allows filling the last seat", () => {
    const before = counted(7);
    expect(() => assertCapacity(8, ids(before), [...before, holder("u7", true)])).not.toThrow();
  });

  it("names every scanner a role edit would promote", () => {
    const before = counted(6);
    const promoted = ["a", "b", "c", "d", "e"].map((id) => holder(id, true));
    expect(() => assertCapacity(8, ids(before), [...before, ...promoted])).toThrow(
      BusinessRuleError,
    );
    try {
      assertCapacity(8, ids(before), [...before, ...promoted]);
    } catch (e) {
      const named = (e as BusinessRuleError).details.filter((d) => d.field?.startsWith("user:"));
      expect(named.map((d) => d.field)).toEqual(["user:a", "user:b", "user:c", "user:d", "user:e"]);
    }
  });

  it("does not block an over-cap tenant from changes that promote nobody (e.g. disabling)", () => {
    const before = counted(10);
    expect(() => assertCapacity(8, ids(before), before.slice(1))).not.toThrow();
    expect(() => assertCapacity(8, ids(before), before)).not.toThrow();
  });

  it("frees the seat of a disabled user for a replacement", () => {
    const before = counted(8).slice(1); // one user DISABLED → no longer seat-eligible
    expect(() => assertCapacity(8, ids(before), [...before, holder("new", true)])).not.toThrow();
  });

  it("is uncapped for a plan-less tenant", () => {
    expect(() => assertCapacity(null, new Set(), counted(100))).not.toThrow();
  });
});
