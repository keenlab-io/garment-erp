/**
 * Reporting route paths, explicitly typed `string` (not a literal) — same rationale as
 * `sales-paths.ts`/`hr-paths.ts`/`inventory-paths.ts`/`production-paths.ts`: `REPORTING_ROUTES`'/
 * `REPORTING_DASHBOARD_ROUTES`' `path` fields are `string` too (route-tree.tsx generates its
 * routes generically from those arrays), so TanStack Router's `Link`/`navigate` never registers
 * these as path literals. Screens that need to link into a dashboard or report (M6 §3/§4 —
 * cross-filter drill-down, KPI clicks) import these helpers instead of writing the path inline.
 */
export const REPORTS_PATH: string = "/reports";
export const REPORTS_SCHEDULES_PATH: string = "/reports/schedules";

/** `/reports/dashboards/{group}` — `group` is a lowercased `ReportGroup` (design D4). */
export function reportDashboardPath(group: string): string {
  return `/reports/dashboards/${group}`;
}

/** `/reports/{report_key}` — the tabular report viewer for one report-catalog key. */
export function reportViewerPath(reportKey: string): string {
  return `/reports/${reportKey}`;
}
