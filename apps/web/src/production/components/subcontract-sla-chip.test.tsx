import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubcontractSlaChip, formatDuration, resolveSlaCountdown } from "./subcontract-sla-chip";

describe("formatDuration", () => {
  it("formats sub-hour durations as minutes only", () => {
    expect(formatDuration(15 * 60_000)).toBe("15m");
  });

  it("formats hour-plus durations as hours and minutes", () => {
    expect(formatDuration(135 * 60_000)).toBe("2h 15m");
  });

  it("is unsigned regardless of the input's sign", () => {
    expect(formatDuration(-135 * 60_000)).toBe("2h 15m");
  });
});

describe("resolveSlaCountdown", () => {
  const now = new Date("2026-07-19T08:00:00.000Z");

  it("is completed once received, with no remaining time", () => {
    expect(resolveSlaCountdown("2026-07-20T08:00:00.000Z", "RECEIVED", now)).toEqual({
      chipStatus: "completed",
      remainingMs: null,
    });
  });

  it("is pending with positive remaining time before the SLA due", () => {
    const result = resolveSlaCountdown("2026-07-19T10:00:00.000Z", "SENT", now);
    expect(result.chipStatus).toBe("pending");
    expect(result.remainingMs).toBe(2 * 60 * 60_000);
  });

  it("is overdue once the SLA due has passed, even if status hasn't caught up yet", () => {
    const result = resolveSlaCountdown("2026-07-19T06:00:00.000Z", "SENT", now);
    expect(result.chipStatus).toBe("overdue");
    expect(result.remainingMs).toBeLessThan(0);
  });

  it("is overdue when status says so regardless of the due date", () => {
    expect(resolveSlaCountdown("2026-07-19T10:00:00.000Z", "OVERDUE", now).chipStatus).toBe("overdue");
  });
});

describe("SubcontractSlaChip", () => {
  const now = new Date("2026-07-19T08:00:00.000Z");

  it("shows a due-in countdown before the SLA", () => {
    render(<SubcontractSlaChip slaDue="2026-07-19T10:00:00.000Z" status="SENT" now={now} />);
    expect(screen.getByText("Due in 2h 0m")).toBeInTheDocument();
  });

  it("shows an overdue-by duration once past the SLA", () => {
    render(<SubcontractSlaChip slaDue="2026-07-19T06:00:00.000Z" status="SENT" now={now} />);
    expect(screen.getByText("Overdue by 2h 0m")).toBeInTheDocument();
  });

  it("shows received once the subcontract comes back", () => {
    render(<SubcontractSlaChip slaDue="2026-07-19T06:00:00.000Z" status="RECEIVED" now={now} />);
    expect(screen.getByText("Received")).toBeInTheDocument();
  });
});
