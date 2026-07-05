import { StateConflictError } from "../errors/app-exception.js";

/**
 * Parse an `If-Match` header into the expected version integer. Returns `null`
 * when the header is absent; throws `StateConflictError` when present but not a
 * valid integer. The quoted ETag form (`"3"`) is tolerated.
 */
export function parseIfMatch(header: string | undefined): number | null {
  if (header === undefined) return null;
  const value = header.trim().replace(/^"(.*)"$/, "$1");
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new StateConflictError("Malformed If-Match version");
  }
  return parsed;
}

/**
 * Assert the current row version matches the client's expected version, rejecting
 * a stale write with 409 STATE_CONFLICT (optimistic concurrency — M0 spec).
 */
export function assertVersion(current: number, expected: number): void {
  if (current !== expected) {
    throw new StateConflictError(
      `Version mismatch: expected ${expected}, found ${current}`,
    );
  }
}
