import { describe, expect, it } from "vitest";
import { actualMinutes, isStepDelayed } from "./production.util.js";

const base = "2026-07-17T00:00:00.000Z";
const at = (min: number) => new Date(new Date(base).getTime() + min * 60_000);

describe("actualMinutes", () => {
  it("returns null for a step that never started", () => {
    expect(actualMinutes({ startedAt: null, finishedAt: null }, at(30))).toBeNull();
  });

  it("measures started → finished", () => {
    expect(actualMinutes({ startedAt: at(0), finishedAt: at(45) }, at(99))).toBe(45);
  });

  it("measures started → now while still running", () => {
    expect(actualMinutes({ startedAt: at(0), finishedAt: null }, at(20))).toBe(20);
  });

  it("never returns negative", () => {
    expect(actualMinutes({ startedAt: at(10), finishedAt: at(5) }, at(99))).toBe(0);
  });
});

describe("isStepDelayed", () => {
  const running = { startedAt: at(0), finishedAt: null, standardTimeMin: 30 };

  it("is false when a not-yet-started step is within any window", () => {
    expect(
      isStepDelayed({ startedAt: null, finishedAt: null, standardTimeMin: 30 }, at(999)),
    ).toBe(false);
  });

  it("is false at exactly the standard time (strictly greater)", () => {
    expect(isStepDelayed(running, at(30))).toBe(false);
  });

  it("is true once elapsed exceeds the standard time", () => {
    expect(isStepDelayed(running, at(31))).toBe(true);
  });

  it("uses finished_at when the step completed under standard", () => {
    expect(
      isStepDelayed({ startedAt: at(0), finishedAt: at(20), standardTimeMin: 30 }, at(999)),
    ).toBe(false);
  });

  it("flags a completed step that overran its standard", () => {
    expect(
      isStepDelayed({ startedAt: at(0), finishedAt: at(50), standardTimeMin: 30 }, at(999)),
    ).toBe(true);
  });
});
