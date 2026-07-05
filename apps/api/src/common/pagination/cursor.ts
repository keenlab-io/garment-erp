import { encodeCursor } from "@erp/utils";

/**
 * Build a keyset-pagination page from a slice fetched with `limit + 1` rows. If an
 * extra row came back there is a next page: drop it and encode the last returned
 * row's keyset as the opaque `next_cursor` (via the `@erp/utils` codec); otherwise
 * `next_cursor` is null. Shape matches the `paginated()` contract helper
 * (`{ data, next_cursor }`).
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => unknown,
): { data: T[]; next_cursor: string | null } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  const next_cursor =
    hasMore && last !== undefined ? encodeCursor(toCursor(last)) : null;
  return { data, next_cursor };
}
