import type { SubscriptionStatus } from "@erp/contracts";

/**
 * Pure M9 dunning schedule (design D3/D5, renewal-dunning spec) — no I/O, so "what is due at
 * `now`" is unit-tested by moving the clock. The sweep applies these decisions; idempotence comes
 * from the persisted `dunning_events`: every touch is keyed by `(kind, touch, term_end)`, so a
 * touch already recorded for the current term never fires again across restarts or overlapping
 * runs, and paying (which moves `term_end`) starts a fresh schedule.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Asia/Bangkok is UTC+7 with no DST — dates shown to a Thai customer are Bangkok dates. */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Pre-expiry reminder touchpoints, days before `term_end` (latest first). */
const PRE_EXPIRY_TOUCHES = [
  { touch: "T-7", days: 7 },
  { touch: "T-14", days: 14 },
  { touch: "T-30", days: 30 },
] as const;

/**
 * A reminder touchpoint: T−30/T−14/T−7/T0 around `term_end`, `GRACE_W{n}` weekly while
 * `IN_GRACE` (week 0 is T0), and `READ_ONLY` once on entry to the degraded state.
 */
export type DunningTouch = "T-30" | "T-14" | "T-7" | "T0" | `GRACE_W${number}` | "READ_ONLY";

/** One persisted entry of `subscription.dunning_events`. */
export interface DunningEvent {
  kind: "RENEWAL_ISSUED" | "REMINDER";
  /** The reminder touchpoint (`REMINDER` only). */
  touch?: DunningTouch;
  /** The `term_end` (ISO) the touch belongs to — the idempotence scope. */
  term_end: string;
  /** When the sweep recorded it (ISO). */
  at: string;
  /** The renewal invoice issued (`RENEWAL_ISSUED`) or reminded about (`REMINDER`). */
  invoice_id?: string | null;
  /** Amount due stated in the reminder (money string). */
  amount_due?: string;
  /** Bangkok date the tenant becomes read-only (grace reminders). */
  read_only_on?: string;
}

export interface DunningConfig {
  graceDays: number;
  renewalLeadDays: number;
}

/** `term_end + grace` — past this instant an `IN_GRACE` subscription is `EXPIRED`. */
export function graceEnd(termEnd: Date, graceDays: number): Date {
  return new Date(termEnd.getTime() + graceDays * DAY_MS);
}

/** The Bangkok calendar date (`YYYY-MM-DD`) of an instant. */
export function bangkokDate(at: Date): string {
  return new Date(at.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The time-driven transitions due at `now`, in order (design D3): `ACTIVE → IN_GRACE` once
 * `now > term_end`, then `IN_GRACE → EXPIRED` once `now > term_end + grace`. A sweep that was down
 * across both boundaries applies both, correctly staged. Nothing ever leads to `SUSPENDED`, and
 * `EXPIRED`/`CANCELLED` have no time-driven exit (only mark-paid / cancel move them).
 */
export function dueTransitions(
  status: SubscriptionStatus,
  termEnd: Date,
  now: Date,
  graceDays: number,
): SubscriptionStatus[] {
  const steps: SubscriptionStatus[] = [];
  let current = status;
  if (current === "ACTIVE" && now.getTime() > termEnd.getTime()) {
    steps.push("IN_GRACE");
    current = "IN_GRACE";
  }
  if (current === "IN_GRACE" && now.getTime() > graceEnd(termEnd, graceDays).getTime()) {
    steps.push("EXPIRED");
  }
  return steps;
}

/** Whether the renewal invoice for the current term is due (`now ≥ term_end − lead`). */
export function renewalDue(
  status: SubscriptionStatus,
  termEnd: Date,
  now: Date,
  renewalLeadDays: number,
): boolean {
  if (status === "CANCELLED") return false;
  return now.getTime() >= termEnd.getTime() - renewalLeadDays * DAY_MS;
}

/**
 * The reminder touchpoint reached at `now` for a subscription already in `status` (i.e. after
 * this pass's transitions). Only the LATEST reached touchpoint is returned: a sweep that was down
 * through T−30 and T−14 sends the T−14 reminder once, not a burst of stale ones.
 */
export function dueTouch(status: SubscriptionStatus, termEnd: Date, now: Date): DunningTouch | null {
  if (status === "CANCELLED") return null;
  if (status === "EXPIRED") return "READ_ONLY";
  const delta = now.getTime() - termEnd.getTime();
  if (delta >= 0) {
    const week = Math.floor(delta / (7 * DAY_MS));
    return week === 0 ? "T0" : `GRACE_W${week}`;
  }
  // `PRE_EXPIRY_TOUCHES` is latest-first, so the first window `now` is inside wins.
  for (const t of PRE_EXPIRY_TOUCHES) {
    if (-delta <= t.days * DAY_MS) return t.touch;
  }
  return null;
}

/** Whether `events` already holds this touch for `termEnd`. */
export function hasEvent(
  events: readonly DunningEvent[],
  kind: DunningEvent["kind"],
  termEnd: Date,
  touch?: DunningTouch,
): boolean {
  const term = termEnd.toISOString();
  return events.some(
    (e) => e.kind === kind && e.term_end === term && (touch === undefined || e.touch === touch),
  );
}

/** Read the jsonb column defensively — anything that is not an event array counts as empty. */
export function parseDunningEvents(raw: unknown): DunningEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is DunningEvent =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as DunningEvent).kind === "string" &&
      typeof (e as DunningEvent).term_end === "string",
  );
}

export interface ReminderContent {
  touch: DunningTouch;
  tenantName: string;
  amountDue: string;
  termEnd: Date;
  /** `term_end + grace` — the date service degrades to read-only. */
  readOnlyOn: Date;
  invoiceNumber?: string | null;
  payment: {
    promptpayId?: string;
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
  };
}

/**
 * Reminder text (renewal-dunning spec): the amount due and payment instructions always; during
 * grace, the exact read-only date and that reading data and exporting keep working after it.
 */
export function reminderMessage(c: ReminderContent): { subject: string; text: string } {
  const termEnd = bangkokDate(c.termEnd);
  const readOnlyOn = bangkokDate(c.readOnlyOn);
  const invoice = c.invoiceNumber ? ` (invoice ${c.invoiceNumber})` : "";

  let subject: string;
  let lead: string;
  if (c.touch === "READ_ONLY") {
    subject = "Your subscription has expired — your workspace is now read-only";
    lead =
      `Your subscription ended on ${termEnd} and the grace period has passed, so your ` +
      `workspace is now read-only. You can still log in, read all your data (including payroll ` +
      `and payslips), and export it. Paying the renewal restores full access immediately.`;
  } else if (c.touch === "T0" || c.touch.startsWith("GRACE_W")) {
    subject = `Your subscription has ended — read-only from ${readOnlyOn}`;
    lead =
      `Your subscription ended on ${termEnd}. Everything keeps working normally until ` +
      `${readOnlyOn}; after that date your workspace becomes read-only until payment is ` +
      `received. Reading your data and exporting it will continue to work after that date.`;
  } else {
    subject = `Your subscription renews on ${termEnd}`;
    lead = `Your subscription term ends on ${termEnd}. Please arrange payment of the renewal.`;
  }

  const p = c.payment;
  const how = [
    p.bankName || p.bankAccountNumber
      ? `Bank transfer: ${[p.bankName, p.bankAccountName, p.bankAccountNumber].filter(Boolean).join(" / ")}`
      : null,
    p.promptpayId ? `PromptPay: ${p.promptpayId}` : null,
  ].filter(Boolean);

  const text = [
    `Dear ${c.tenantName},`,
    "",
    lead,
    "",
    `Amount due${invoice}: THB ${c.amountDue} (excluding VAT)`,
    ...(how.length ? ["", "How to pay:", ...how.map((h) => `- ${h}`)] : []),
    "",
    "Please quote the invoice number as the transfer reference.",
  ].join("\n");
  return { subject, text };
}
