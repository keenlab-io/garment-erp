import { describe, expect, it } from "vitest";
import {
  bangkokDate,
  dueTouch,
  dueTransitions,
  graceEnd,
  hasEvent,
  parseDunningEvents,
  reminderMessage,
  renewalDue,
  type DunningEvent,
} from "./dunning-schedule.js";

// M9 §4.1/4.2 — the pure dunning schedule: which transitions, renewal and reminder touch are due
// at a given clock. Term ends 2027-03-31T00:00Z (07:00 Bangkok); grace 15 days.

const TERM_END = new Date("2027-03-31T00:00:00.000Z");
const at = (days: number) => new Date(TERM_END.getTime() + days * 86_400_000);

describe("dueTransitions", () => {
  it("does nothing up to and at term_end", () => {
    expect(dueTransitions("ACTIVE", TERM_END, at(-1), 15)).toEqual([]);
    expect(dueTransitions("ACTIVE", TERM_END, TERM_END, 15)).toEqual([]);
  });

  it("moves ACTIVE → IN_GRACE once past term_end, leaving grace alone", () => {
    expect(dueTransitions("ACTIVE", TERM_END, at(3), 15)).toEqual(["IN_GRACE"]);
    expect(dueTransitions("IN_GRACE", TERM_END, at(15), 15)).toEqual([]);
  });

  it("moves IN_GRACE → EXPIRED once past term_end + grace", () => {
    expect(dueTransitions("IN_GRACE", TERM_END, at(15.01), 15)).toEqual(["EXPIRED"]);
  });

  it("stages both steps when the sweep was down across both boundaries", () => {
    expect(dueTransitions("ACTIVE", TERM_END, at(40), 15)).toEqual(["IN_GRACE", "EXPIRED"]);
  });

  it("never moves EXPIRED or CANCELLED (and never SUSPENDS)", () => {
    expect(dueTransitions("EXPIRED", TERM_END, at(400), 15)).toEqual([]);
    expect(dueTransitions("CANCELLED", TERM_END, at(400), 15)).toEqual([]);
  });

  it("honours a zero-day grace", () => {
    expect(dueTransitions("ACTIVE", TERM_END, at(0.5), 0)).toEqual(["IN_GRACE", "EXPIRED"]);
  });
});

describe("renewalDue", () => {
  it("opens the renewal window at term_end − lead", () => {
    expect(renewalDue("ACTIVE", TERM_END, at(-46), 45)).toBe(false);
    expect(renewalDue("ACTIVE", TERM_END, at(-45), 45)).toBe(true);
    expect(renewalDue("IN_GRACE", TERM_END, at(2), 45)).toBe(true);
  });

  it("skips CANCELLED subscriptions", () => {
    expect(renewalDue("CANCELLED", TERM_END, at(-10), 45)).toBe(false);
  });
});

describe("dueTouch", () => {
  it.each([
    [-31, null],
    [-30, "T-30"],
    [-20, "T-30"],
    [-14, "T-14"],
    [-8, "T-14"],
    [-7, "T-7"],
    [-0.5, "T-7"],
    [0, "T0"],
    [6.9, "T0"],
    [7, "GRACE_W1"],
    [14, "GRACE_W2"],
  ])("at T%s days → %s", (days, touch) => {
    const status = days > 0 ? "IN_GRACE" : "ACTIVE";
    expect(dueTouch(status, TERM_END, at(days))).toBe(touch);
  });

  it("is READ_ONLY (once-keyed) whenever EXPIRED, and nothing when CANCELLED", () => {
    expect(dueTouch("EXPIRED", TERM_END, at(16))).toBe("READ_ONLY");
    expect(dueTouch("EXPIRED", TERM_END, at(60))).toBe("READ_ONLY");
    expect(dueTouch("CANCELLED", TERM_END, at(-7))).toBeNull();
  });
});

describe("dunning events", () => {
  const events: DunningEvent[] = [
    { kind: "REMINDER", touch: "T-14", term_end: TERM_END.toISOString(), at: at(-14).toISOString() },
    { kind: "RENEWAL_ISSUED", term_end: TERM_END.toISOString(), at: at(-45).toISOString() },
  ];

  it("matches a touch only within the same term", () => {
    expect(hasEvent(events, "REMINDER", TERM_END, "T-14")).toBe(true);
    expect(hasEvent(events, "REMINDER", TERM_END, "T-7")).toBe(false);
    expect(hasEvent(events, "REMINDER", at(365), "T-14")).toBe(false);
    expect(hasEvent(events, "RENEWAL_ISSUED", TERM_END)).toBe(true);
    expect(hasEvent(events, "RENEWAL_ISSUED", at(365))).toBe(false);
  });

  it("parses the jsonb column defensively", () => {
    expect(parseDunningEvents(null)).toEqual([]);
    expect(parseDunningEvents({})).toEqual([]);
    expect(parseDunningEvents([...events, 42, { kind: "X" }])).toEqual(events);
  });
});

describe("dates", () => {
  it("computes the grace end and Bangkok dates", () => {
    expect(graceEnd(TERM_END, 15).toISOString()).toBe("2027-04-15T00:00:00.000Z");
    expect(bangkokDate(new Date("2027-03-31T18:00:00.000Z"))).toBe("2027-04-01");
  });
});

describe("reminderMessage", () => {
  const base = {
    tenantName: "Siam Garments",
    amountDue: "125000.00",
    termEnd: TERM_END,
    readOnlyOn: graceEnd(TERM_END, 15),
    invoiceNumber: "SINV-2027-0007",
    payment: { bankName: "KBank", bankAccountNumber: "123-4-56789-0", promptpayId: "0105555000000" },
  };

  it("states the amount and payment instructions before expiry", () => {
    const m = reminderMessage({ ...base, touch: "T-14" });
    expect(m.subject).toContain("2027-03-31");
    expect(m.text).toContain("THB 125000.00");
    expect(m.text).toContain("SINV-2027-0007");
    expect(m.text).toContain("KBank");
    expect(m.text).toContain("PromptPay: 0105555000000");
  });

  it("names the read-only date and that reads and exports continue during grace", () => {
    const m = reminderMessage({ ...base, touch: "GRACE_W1" });
    expect(m.subject).toContain("2027-04-15");
    expect(m.text).toContain("2027-04-15");
    expect(m.text).toMatch(/Reading your data and exporting it will continue to work/);
  });

  it("explains READ_ONLY entry", () => {
    const m = reminderMessage({ ...base, touch: "READ_ONLY", payment: {} });
    expect(m.subject).toMatch(/read-only/);
    expect(m.text).toMatch(/payroll/);
    expect(m.text).not.toContain("How to pay");
  });
});
