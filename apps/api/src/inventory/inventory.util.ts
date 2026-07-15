import { asMoney, asQty, type Money, type Qty } from "@erp/contracts";
import { tryDecodeCursor } from "@erp/utils";

/**
 * Boundary casts that assert an already-formatted decimal string into the branded wire
 * type (`Money`/`Qty`). Postgres numeric columns and the `@erp/utils` helpers hand back
 * plain strings; these tag them where a DTO is produced (per the money-string convention).
 */
export const m = (v: string): Money => asMoney(v);
export const q = (v: string): Qty => asQty(v);
export const mN = (v: string | null): Money | null => (v === null ? null : asMoney(v));
export const qN = (v: string | null): Qty | null => (v === null ? null : asQty(v));

/** Keyset carried by the item-list cursor (created_at, id) — descending order. */
export interface ItemCursor {
  createdAt: string;
  id: string;
}

/** Decode an item-list cursor, tolerating malformed input (returns null). */
export function decodeItemCursor(cursor: string): ItemCursor | null {
  const decoded = tryDecodeCursor(cursor) as ItemCursor | null;
  return decoded && decoded.createdAt && decoded.id ? decoded : null;
}

/**
 * A human-readable document number derived from the row's uuid. Document sequences
 * (GR/GI/count/adjustment) are not seeded, so — unlike the item `code` — these codes are
 * generated from the primary key: collision-free and unique-index safe without a
 * `document_sequence` round-trip.
 */
export function docCode(prefix: string, id: string): string {
  return `${prefix}-${id.slice(0, 8).toUpperCase()}`;
}
