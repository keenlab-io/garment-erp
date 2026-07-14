import { describe, it, expect } from "vitest";
import { resolveDensity } from "./resolve-density";

describe("resolveDensity", () => {
  it("forces Touch on kiosk routes, overriding an explicit preference", () => {
    expect(resolveDensity({ kioskActive: true, userPref: "compact", coarsePointer: false })).toBe(
      "touch",
    );
    expect(resolveDensity({ kioskActive: true, userPref: null, coarsePointer: false })).toBe(
      "touch",
    );
  });

  it("uses the explicit user preference off kiosk routes", () => {
    expect(resolveDensity({ kioskActive: false, userPref: "compact", coarsePointer: true })).toBe(
      "compact",
    );
    expect(
      resolveDensity({ kioskActive: false, userPref: "comfortable", coarsePointer: true }),
    ).toBe("comfortable");
  });

  it("defaults a coarse pointer to Touch when no preference is set", () => {
    expect(resolveDensity({ kioskActive: false, userPref: null, coarsePointer: true })).toBe(
      "touch",
    );
  });

  it("defaults to Comfortable with a fine pointer and no preference", () => {
    expect(resolveDensity({ kioskActive: false, userPref: null, coarsePointer: false })).toBe(
      "comfortable",
    );
  });
});
