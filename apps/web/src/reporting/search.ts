/**
 * Typed search-param validators for the reporting cross-filter (M6 §1.2, design MD1) — filter
 * state lives in the URL via TanStack Router search params so a filtered dashboard/report is
 * shareable and survives reload. No zod in `apps/web` (see `router/routes/login.tsx`), so these
 * are plain type guards mirroring the shapes of the `reporting` contract's `DashboardQuery`/
 * `ReportQuery` (`@erp/contracts`).
 */

/** `/` (overview) and `/reports/dashboards/{group}` — one `(dimension, value)` filter (design D6). */
export interface DashboardFilterSearch {
  dimension?: string;
  value?: string;
}

export function validateDashboardSearch(search: Record<string, unknown>): DashboardFilterSearch {
  const { dimension, value } = search;
  return {
    ...(typeof dimension === "string" ? { dimension } : {}),
    ...(typeof value === "string" ? { value } : {}),
  };
}

/**
 * `/reports/{report_key}` — `from`/`to`/`dimension`/`value` plus arbitrary report-specific
 * `filters…`, matching the contract's `ReportQuery.catchall(z.string())`.
 */
export interface ReportFilterSearch {
  from?: string;
  to?: string;
  dimension?: string;
  value?: string;
  [filterKey: string]: string | undefined;
}

export function validateReportSearch(search: Record<string, unknown>): ReportFilterSearch {
  const result: ReportFilterSearch = {};
  for (const [key, raw] of Object.entries(search)) {
    if (typeof raw === "string") result[key] = raw;
  }
  return result;
}
