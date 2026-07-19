import * as React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { DashboardQuery, ReportQuery, ReportSchedulesQuery } from "@erp/contracts";
import { ExportStatus } from "@erp/contracts";
import { api } from "../api/client.js";
import type { DashboardFilterSearch, ReportFilterSearch } from "./search.js";

/**
 * Query keys for the `reporting` domain (M6 §2.1). One place so a mutation's invalidation and a
 * query's key can never drift apart. `getReport`/`getDashboard` are keyed by their full query
 * object (not just the id) — every cross-filter change (design MD1) is a distinct cache entry, so
 * clicking a dimension never serves a stale panel from a different slice.
 */
export const reportingKeys = {
  all: ["reporting"] as const,
  reportsAll: () => [...reportingKeys.all, "reports"] as const,
  report: (reportKey: string, query: ReportQuery = {}) =>
    [...reportingKeys.reportsAll(), reportKey, query] as const,
  dashboardsAll: () => [...reportingKeys.all, "dashboards"] as const,
  dashboard: (key: string, query: Partial<DashboardQuery> = {}) =>
    [...reportingKeys.dashboardsAll(), key, query] as const,
  exportsAll: () => [...reportingKeys.all, "exports"] as const,
  export: (jobId: string) => [...reportingKeys.exportsAll(), jobId] as const,
  schedulesAll: () => [...reportingKeys.all, "schedules"] as const,
  schedules: (query: Partial<ReportSchedulesQuery> = {}) =>
    [...reportingKeys.schedulesAll(), query] as const,
};

// ── Reports (report.<group>.view; cost/profit also require inventory.cost.view) ─────────────────

/** `report_key` is validated server-side (404 for an unknown key) — `enabled` guards against
 * firing the request before a report is picked (the report viewer, browsed from Reports home). */
export function useReportQuery(reportKey: string, query: ReportQuery = {}) {
  const queryKey = reportingKeys.report(reportKey, query);
  return api.reporting.getReport.useQuery(
    queryKey,
    { params: { report_key: reportKey }, query },
    { queryKey, enabled: Boolean(reportKey) },
  );
}

export function useExportReportMutation() {
  return api.reporting.exportReport.useMutation();
}

/**
 * Polls `GET /exports/{job_id}` (M6 §2.1 "job-status polling for exports") while the job is
 * PENDING/RUNNING; stops once it settles at DONE (with `file_url`) or FAILED, matching design
 * MD4's job-toast → notification with the signed-URL file.
 */
export function exportPollInterval(
  data: { status: number; body?: { status: string } } | undefined,
): number | false {
  const jobStatus = data?.status === 200 ? data.body?.status : undefined;
  return jobStatus === ExportStatus.PENDING || jobStatus === ExportStatus.RUNNING ? 2000 : false;
}

export function useExportStatusQuery(jobId: string, options: { enabled?: boolean } = {}) {
  const queryKey = reportingKeys.export(jobId);
  return api.reporting.getExport.useQuery(
    queryKey,
    { params: { job_id: jobId } },
    {
      queryKey,
      enabled: (options.enabled ?? true) && Boolean(jobId),
      refetchInterval: (query) => exportPollInterval(query.state.data),
    },
  );
}

// ── Dashboards (report.<group>.view) ─────────────────────────────────────────────────────────────

/** `options.enabled` lets a screen defer/skip the fetch (M6 §4.1 dashboards-ui) — e.g. the cost/
 * profit dashboards without `inventory.cost.view`, which the backend 403s wholesale rather than
 * field-masking (design MD2's "masked without `inventory.cost.view`" is therefore enforced by not
 * firing the request at all, not by an in-page mask over a successful response). */
export function useDashboardQuery(
  key: string,
  query: Partial<DashboardQuery> = {},
  options: { enabled?: boolean } = {},
) {
  const queryKey = reportingKeys.dashboard(key, query);
  return api.reporting.getDashboard.useQuery(
    queryKey,
    { params: { key }, query },
    { queryKey, enabled: (options.enabled ?? true) && Boolean(key) },
  );
}

// ── Report schedules (report.schedule.manage) ───────────────────────────────────────────────────

export function useReportSchedulesQuery(query: Partial<ReportSchedulesQuery> = {}) {
  return api.reporting.listReportSchedules.useQuery(reportingKeys.schedules(query), { query });
}

export function useCreateReportScheduleMutation() {
  const queryClient = useQueryClient();
  return api.reporting.createReportSchedule.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportingKeys.schedulesAll() });
    },
  });
}

/** Caller passes `headers: { "if-match": String(schedule.version) }` (same convention as
 * `hr/employee-detail.tsx`'s optimistic-concurrency updates) — 409s on a version conflict. */
export function useUpdateReportScheduleMutation() {
  const queryClient = useQueryClient();
  return api.reporting.updateReportSchedule.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportingKeys.schedulesAll() });
    },
  });
}

export function useDeleteReportScheduleMutation() {
  const queryClient = useQueryClient();
  return api.reporting.deleteReportSchedule.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportingKeys.schedulesAll() });
    },
  });
}

/** Fire-and-forget preview-send (design MD5 "[Run now]") — doesn't touch the schedules list, so
 * no invalidation. */
export function useRunReportScheduleNowMutation() {
  return api.reporting.runReportScheduleNow.useMutation();
}

// ── Cross-filter state via router search params (M6 §2.1, design MD1) ───────────────────────────
// Six routes share the same `(dimension, value)` dashboard filter shape (`/` plus the five
// `/reports/dashboards/{group}` domain dashboards, see `nav/registry.ts`'s `REPORTING_DASHBOARD_
// ROUTES`) and the report viewer (`/reports/{report_key}`) has its own richer shape — each hook
// takes its caller's own route id, same as `useSearch({ from: "/login" })` elsewhere in this repo,
// so TanStack Router type-checks it against the registered route tree instead of a loose cast.

export interface FilterState<TFilter> {
  filter: TFilter;
  /** Replaces the active filter set (design MD1: exactly one dimension/value slice is active). */
  setFilter: (next: TFilter) => void;
  /** "Clear" resets to the unfiltered view (design MD1). */
  clearFilter: () => void;
}

/**
 * Reads/writes the overview + domain dashboards' `(dimension, value)` cross-filter — shareable via
 * URL, survives reload (design MD1). Dashboard routes are generated from `REPORTING_DASHBOARD_
 * ROUTES`' `path: string` (deliberately widened, not a literal — see `nav/reporting-paths.ts`), so
 * they never enter TanStack Router's typed `RoutePaths` union; pass the caller's own route path
 * (e.g. `useDashboardFilter(REPORTS_PATH)`) same as `<Link to={module.path}>`/`navigate({ to: path
 * })` do elsewhere for these routes (`shell/NavItem.tsx`, `command-palette/CommandPalette.tsx`) —
 * a plain (non-literal) `string` `to` resolves loosely instead of requiring a registered literal.
 * Runtime shape safety comes from every dashboard route's `validateSearch: validateDashboardSearch`.
 */
export function useDashboardFilter(from: string): FilterState<DashboardFilterSearch> {
  const filter = useSearch({ strict: false }) as DashboardFilterSearch;
  const navigate = useNavigate();
  const setFilter = React.useCallback(
    (next: DashboardFilterSearch) => {
      // The generic `to: string` above means the search reducer's expected type is the union of
      // every registered route's search schema (some of which — e.g. the report viewer — declare
      // an index signature `DashboardFilterSearch` doesn't have); this cast is safe because the
      // object only ever contains the string-valued `dimension`/`value` keys `validateDashboardSearch`
      // parses back out on the far end.
      void navigate({
        to: from,
        search: () => next as Record<string, string | undefined>,
        replace: true,
      });
    },
    [navigate, from],
  );
  const clearFilter = React.useCallback(() => {
    void navigate({ to: from, search: () => ({}) as Record<string, string | undefined>, replace: true });
  }, [navigate, from]);
  return { filter, setFilter, clearFilter };
}

/** Reads/writes the report viewer's `from`/`to`/`dimension`/`value` + report-specific filters. */
export function useReportFilter(): FilterState<ReportFilterSearch> {
  const filter = useSearch({ from: "/reports/$reportKey", strict: true });
  const navigate = useNavigate({ from: "/reports/$reportKey" });
  const setFilter = React.useCallback(
    (next: ReportFilterSearch) => {
      void navigate({ search: () => next, replace: true });
    },
    [navigate],
  );
  const clearFilter = React.useCallback(() => {
    void navigate({ search: () => ({}), replace: true });
  }, [navigate]);
  return { filter, setFilter, clearFilter };
}
