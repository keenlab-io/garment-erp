import type { ReportQuery } from "@erp/contracts";

/**
 * A resolved reporting window — the inclusive `[from, to]` date bounds every catalog builder
 * filters by. Both bounds are optional ISO `YYYY-MM-DD` dates; a builder that receives neither
 * reads the whole read model.
 */
export interface ReportWindow {
  from?: string;
  to?: string;
}

/** Last calendar day of a `YYYY-MM` month, as `YYYY-MM-DD` (UTC, no `Date.now`). */
function endOfMonth(year: number, month1to12: number): string {
  // Day 0 of the next month is the last day of this month.
  const d = new Date(Date.UTC(year, month1to12, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the reporting window from the query. A `(dimension, value)` pair takes precedence and
 * is what the cross-filtered dashboard threads to every panel (design D6): `dimension=month`
 * with `value=YYYY-MM` expands to that whole month, `dimension=day` with `value=YYYY-MM-DD`
 * pins a single day. Absent a dimension, the explicit `from`/`to` are used verbatim. The result
 * is deterministic — the same input always yields the same window, so all panels of one
 * dashboard request filter to an identical range.
 */
export function resolveWindow(query: ReportQuery): ReportWindow {
  const { dimension, value } = query;
  if (dimension === "month" && value && /^\d{4}-\d{2}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    return { from: `${value}-01`, to: endOfMonth(year, month) };
  }
  if (dimension === "day" && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { from: value, to: value };
  }
  return { from: query.from, to: query.to };
}
