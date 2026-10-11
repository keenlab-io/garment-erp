import { ErrorCode } from "@erp/contracts";

/** What a seat-limit 422 tells the admin (M8 design D3–D5). */
export interface SeatLimitInfo {
  /** Included + extra seats the plan allows; null when the api omitted/garbled it. */
  cap: number | null;
  /** Seats in use before the refused change. */
  counted: number | null;
  /** Free scan-only floor accounts. */
  exempt: number | null;
  /** Usernames the refused change would have moved into a seat (role edits name them, D4). */
  users: string[];
}

interface ErrorLike {
  status?: unknown;
  body?: { code?: unknown; details?: unknown };
}

const SEAT_LIMIT_ISSUE = "seat limit reached";

function toCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Recognises the over-cap `BUSINESS_RULE` 422 and extracts its counts. It is a plain business-rule
 * error (no dedicated code), so it is identified by its `seats / seat limit reached` detail. Any
 * other error — including other 422s — returns null so callers fall through to generic handling.
 */
export function parseSeatLimitError(error: unknown): SeatLimitInfo | null {
  const e = error as ErrorLike | null | undefined;
  if (!e || e.status !== 422 || e.body?.code !== ErrorCode.BUSINESS_RULE) return null;
  const details = e.body.details;
  if (!Array.isArray(details)) return null;
  const rows = details.filter(
    (d): d is { field?: string; issue: string } =>
      typeof d === "object" && d !== null && typeof (d as { issue?: unknown }).issue === "string",
  );
  if (!rows.some((d) => d.field === "seats" && d.issue === SEAT_LIMIT_ISSUE)) return null;
  const issueOf = (field: string) => rows.find((d) => d.field === field)?.issue;
  return {
    cap: toCount(issueOf("cap")),
    counted: toCount(issueOf("counted")),
    exempt: toCount(issueOf("exempt")),
    users: rows
      .filter((d) => d.field?.startsWith("user:"))
      .map((d) => (d.field as string).slice("user:".length)),
  };
}
