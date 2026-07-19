import * as React from "react";
import type { SubcontractStatus } from "@erp/contracts";
import { InkChip, type ChipStatus } from "@erp/ui";

/** How often the countdown re-renders when no `now` is injected (a live clock, not a stopwatch). */
const TICK_MS = 60_000;

export interface SlaCountdown {
  chipStatus: ChipStatus;
  /** Signed: negative once overdue. `null` once received or with no `sla_due` set. */
  remainingMs: number | null;
}

/**
 * Resolves a subcontract's SLA to a chip status + signed remaining time (M4 §3.4, design MD4) — a
 * received subcontract is done; an explicit `OVERDUE` status or a passed `sla_due` both flip the
 * chip to the danger `overdue` status regardless of which caught it first (a monitor sweep vs this
 * component's own clock).
 */
export function resolveSlaCountdown(
  slaDue: string | null,
  status: SubcontractStatus,
  now: Date = new Date(),
): SlaCountdown {
  if (status === "RECEIVED") return { chipStatus: "completed", remainingMs: null };
  const dueMs = slaDue ? new Date(slaDue).getTime() : null;
  const remainingMs = dueMs == null ? null : dueMs - now.getTime();
  const overdue = status === "OVERDUE" || (remainingMs != null && remainingMs <= 0);
  return { chipStatus: overdue ? "overdue" : "pending", remainingMs };
}

/** Formats an unsigned duration as `"2h 15m"` / `"15m"` — never negative, the caller states the sign. */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(Math.abs(ms) / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export interface SubcontractSlaChipLabels {
  due: (duration: string) => string;
  overdue: (duration: string) => string;
  received: string;
  noDueDate: string;
}

const defaultLabels: SubcontractSlaChipLabels = {
  due: (duration) => `Due in ${duration}`,
  overdue: (duration) => `Overdue by ${duration}`,
  received: "Received",
  noDueDate: "No SLA set",
};

export interface SubcontractSlaChipProps {
  slaDue: string | null;
  status: SubcontractStatus;
  /** Injectable clock for tests/stories; omit for a live countdown that ticks every minute. */
  now?: Date;
  labels?: Partial<SubcontractSlaChipLabels>;
  className?: string;
}

/**
 * The subcontract SLA countdown chip (M4 §3.4, design MD4) — counts down to `sla_due` and flips to
 * a danger chip once overdue. Ticks its own live clock every minute so a screen doesn't have to
 * re-render it; pass `now` to freeze it for tests and stories.
 */
export function SubcontractSlaChip({ slaDue, status, now: nowProp, labels: labelsProp, className }: SubcontractSlaChipProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [, forceTick] = React.useState(0);

  React.useEffect(() => {
    if (nowProp) return;
    const id = setInterval(() => forceTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [nowProp]);

  const now = nowProp ?? new Date();
  const { chipStatus, remainingMs } = resolveSlaCountdown(slaDue, status, now);

  let label: string;
  if (status === "RECEIVED") {
    label = labels.received;
  } else if (remainingMs == null) {
    label = labels.noDueDate;
  } else if (remainingMs <= 0) {
    label = labels.overdue(formatDuration(remainingMs));
  } else {
    label = labels.due(formatDuration(remainingMs));
  }

  return <InkChip status={chipStatus} label={label} className={className} />;
}
