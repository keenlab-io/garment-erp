import { describe, expect, it } from "vitest";
import {
  durationToSeconds,
  isLocked,
  lockoutUntil,
  LOCKOUT_MINUTES,
  LOCKOUT_THRESHOLD,
  shouldLock,
} from "./iam.util.js";

describe("durationToSeconds", () => {
  it("parses unit-suffixed durations", () => {
    expect(durationToSeconds("90s")).toBe(90);
    expect(durationToSeconds("15m")).toBe(900);
    expect(durationToSeconds("2h")).toBe(7200);
    expect(durationToSeconds("7d")).toBe(604_800);
  });

  it("treats a bare number as seconds", () => {
    expect(durationToSeconds("3600")).toBe(3600);
  });

  it("falls back to 15 minutes on garbage input", () => {
    expect(durationToSeconds("nonsense")).toBe(900);
  });
});

describe("lockout policy", () => {
  it("trips exactly at the threshold", () => {
    expect(shouldLock(LOCKOUT_THRESHOLD - 1)).toBe(false);
    expect(shouldLock(LOCKOUT_THRESHOLD)).toBe(true);
    expect(shouldLock(LOCKOUT_THRESHOLD + 1)).toBe(true);
  });

  it("locks for the configured window", () => {
    const now = 1_000_000;
    expect(lockoutUntil(now).getTime()).toBe(now + LOCKOUT_MINUTES * 60 * 1000);
  });

  it("reports locked only while the timestamp is in the future", () => {
    const now = 1_000_000;
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date(now - 1), now)).toBe(false);
    expect(isLocked(new Date(now + 1), now)).toBe(true);
  });
});
