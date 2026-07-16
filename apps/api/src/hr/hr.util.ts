import { asMoney, asQty, type Money, type Qty } from "@erp/contracts";
import { tryDecodeCursor } from "@erp/utils";

/**
 * Boundary casts that tag an already-formatted decimal string with the branded wire type
 * (`Money`/`Qty`). Postgres numeric columns and the `@erp/utils` helpers hand back plain
 * strings; these assert them where an HR DTO is produced (money-string convention).
 */
export const m = (v: string): Money => asMoney(v);
export const q = (v: string): Qty => asQty(v);
export const mN = (v: string | null): Money | null => (v === null ? null : asMoney(v));
export const qN = (v: string | null): Qty | null => (v === null ? null : asQty(v));

/** Keyset carried by the employee-list cursor (created_at, id) — descending order. */
export interface EmployeeCursor {
  createdAt: string;
  id: string;
}

/** Decode an employee-list cursor, tolerating malformed input (returns null). */
export function decodeEmployeeCursor(cursor: string): EmployeeCursor | null {
  const decoded = tryDecodeCursor(cursor) as EmployeeCursor | null;
  return decoded && decoded.createdAt && decoded.id ? decoded : null;
}

/** Today's date as a `YYYY-MM-DD` string (for effective-dated config / salary lookups). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** First and last day of a `YYYY-MM` period as `YYYY-MM-DD` strings. */
export function periodBounds(period: string): { start: string; end: string } {
  const [year, month] = period.split("-").map(Number);
  const y = year ?? 1970;
  const mo = month ?? 1;
  const start = `${period}-01`;
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const end = `${period}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
