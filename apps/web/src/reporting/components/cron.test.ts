import { describe, it, expect } from "vitest";
import { cadenceFromCron, cronFromCadence, describeCadence, weekdayLabel } from "./cron";

describe("cronFromCadence", () => {
  it("builds a daily cron with a wildcard day-of-week", () => {
    expect(cronFromCadence({ frequency: "daily", time: "08:00" })).toBe("0 8 * * *");
  });

  it("builds a weekly cron for the given day-of-week", () => {
    expect(cronFromCadence({ frequency: "weekly", dayOfWeek: 1, time: "08:00" })).toBe("0 8 * * 1");
  });

  it("defaults to Sunday when a weekly cadence has no day-of-week", () => {
    expect(cronFromCadence({ frequency: "weekly", time: "17:30" })).toBe("30 17 * * 0");
  });
});

describe("cadenceFromCron", () => {
  it("round-trips a daily cadence", () => {
    expect(cadenceFromCron("0 8 * * *")).toEqual({ frequency: "daily", time: "08:00" });
  });

  it("round-trips a weekly cadence", () => {
    expect(cadenceFromCron("0 8 * * 1")).toEqual({ frequency: "weekly", dayOfWeek: 1, time: "08:00" });
  });

  it("round-trips cronFromCadence output", () => {
    const cadence: Parameters<typeof cronFromCadence>[0] = { frequency: "weekly", dayOfWeek: 5, time: "23:45" };
    expect(cadenceFromCron(cronFromCadence(cadence))).toEqual(cadence);
  });

  it("returns undefined for a cron with a day-of-month restriction", () => {
    expect(cadenceFromCron("0 8 1 * *")).toBeUndefined();
  });

  it("returns undefined for a cron with a month restriction", () => {
    expect(cadenceFromCron("0 8 * 1 *")).toBeUndefined();
  });

  it("returns undefined for a malformed expression", () => {
    expect(cadenceFromCron("not a cron")).toBeUndefined();
  });
});

describe("describeCadence", () => {
  it("describes a daily cadence", () => {
    expect(describeCadence({ frequency: "daily", time: "08:00" })).toBe("Every day 08:00");
  });

  it("describes a weekly cadence with the weekday name", () => {
    expect(describeCadence({ frequency: "weekly", dayOfWeek: 1, time: "08:00" })).toBe(
      "Every Monday 08:00",
    );
  });
});

describe("weekdayLabel", () => {
  it("maps 0-6 to Sunday-Saturday", () => {
    expect(weekdayLabel(0)).toBe("Sunday");
    expect(weekdayLabel(6)).toBe("Saturday");
  });
});
