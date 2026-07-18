import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { ExportStatus, ReportExportFormat, ReportGroup } from "../enums/index.js";
import {
  API_PREFIX,
  ifMatchHeader,
  jobAccepted,
  paginated,
  paginationQuery,
  uuid,
  withErrors,
} from "./_shared.js";

/**
 * M6 — Reporting & Analytics contract (spec §6, plan `docs/plans/M6-reporting.md` §1). Router
 * `reportingContract` covers the read-only report catalog (`GET /reports/{report_key}`), the
 * cross-filtered dashboard engine, async Excel/CSV/PDF exports with signed-URL retrieval, and
 * `report_schedule` CRUD + run-now for the cron email digest. Every endpoint authorizes
 * in-handler via `assertPermissions(user, "report.<group>.view")`; cost/profit reports
 * additionally assert `inventory.cost.view` (design D5). All report/dashboard endpoints are
 * GET and read-only — they read exclusively from the M6 materialized views, never operational
 * tables directly (spec §6.1).
 */

const c = initContract();

// ── Enum schemas ──────────────────────────────────────────────────────────────

export const exportFormat = z.nativeEnum(ReportExportFormat);
export const exportStatus = z.nativeEnum(ExportStatus);
export const reportGroup = z.nativeEnum(ReportGroup);

// ── Report catalog (design D4) ─────────────────────────────────────────────────

/** The full report catalog — every valid `report_key`, grouped per design D4. */
export const REPORT_KEYS = [
  "stock.balance",
  "stock.movement",
  "stock.low",
  "stock.dead",
  "sales.overview",
  "sales.top_products",
  "sales.by_customer",
  "sales.doc_status",
  "cost.cogs_monthly",
  "cost.variance",
  "cost.valuation",
  "profit.margin_by_item",
  "profit.by_order",
  "profit.net_estimate",
  "tax.pp30",
  "tax.aging",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

const REPORT_KEY_GROUP: Record<ReportKey, ReportGroup> = {
  "stock.balance": ReportGroup.INVENTORY,
  "stock.movement": ReportGroup.INVENTORY,
  "stock.low": ReportGroup.INVENTORY,
  "stock.dead": ReportGroup.INVENTORY,
  "sales.overview": ReportGroup.SALES,
  "sales.top_products": ReportGroup.SALES,
  "sales.by_customer": ReportGroup.SALES,
  "sales.doc_status": ReportGroup.SALES,
  "cost.cogs_monthly": ReportGroup.COST,
  "cost.variance": ReportGroup.COST,
  "cost.valuation": ReportGroup.COST,
  "profit.margin_by_item": ReportGroup.PROFIT,
  "profit.by_order": ReportGroup.PROFIT,
  "profit.net_estimate": ReportGroup.PROFIT,
  "tax.pp30": ReportGroup.TAX,
  "tax.aging": ReportGroup.TAX,
};

/** Look up a `report_key`'s RBAC group; `undefined` for an unknown key (→ handler 404). */
export function reportGroupForKey(key: string): ReportGroup | undefined {
  return REPORT_KEY_GROUP[key as ReportKey];
}

/** Groups that additionally require `inventory.cost.view` on top of `report.<group>.view`. */
export const COST_GATED_REPORT_GROUPS: readonly ReportGroup[] = [
  ReportGroup.COST,
  ReportGroup.PROFIT,
];

// ── Reports ───────────────────────────────────────────────────────────────────

export const ReportColumn = z.object({
  key: z.string(),
  label: z.string(),
});
export type ReportColumn = z.infer<typeof ReportColumn>;

const ReportCellValue = z.union([z.string(), z.number(), z.null()]);

export const ReportRow = z.record(ReportCellValue);
export type ReportRow = z.infer<typeof ReportRow>;

export const ReportTotals = z.record(ReportCellValue);
export type ReportTotals = z.infer<typeof ReportTotals>;

/** `GET /reports/{report_key}` response — tabular result read from the M6 materialized views. */
export const ReportResult = z.object({
  columns: z.array(ReportColumn),
  rows: z.array(ReportRow),
  totals: ReportTotals,
});
export type ReportResult = z.infer<typeof ReportResult>;

/** `from`/`to`/`dimension`/`value` plus arbitrary report-specific `filters…` (all strings). */
export const ReportQuery = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    dimension: z.string().optional(),
    value: z.string().optional(),
  })
  .catchall(z.string());
export type ReportQuery = z.infer<typeof ReportQuery>;

export const ExportReportRequest = z.object({
  format: exportFormat,
  params: z.record(z.unknown()).default({}),
});
export type ExportReportRequest = z.infer<typeof ExportReportRequest>;

/** `GET /exports/{job_id}` response — `file_url` is present only once `status` is `DONE`. */
export const ExportStatusResult = z.object({
  status: exportStatus,
  file_url: z.string().optional(),
});
export type ExportStatusResult = z.infer<typeof ExportStatusResult>;

// ── Dashboards ────────────────────────────────────────────────────────────────

export const DashboardPanel = z.object({
  key: z.string(),
  data: z.record(z.unknown()),
});
export type DashboardPanel = z.infer<typeof DashboardPanel>;

export const DashboardResult = z.object({
  panels: z.array(DashboardPanel),
});
export type DashboardResult = z.infer<typeof DashboardResult>;

/** One `(dimension, value)` filter set, applied consistently across every panel (design D6). */
export const DashboardQuery = z.object({
  dimension: z.string().optional(),
  value: z.string().optional(),
});
export type DashboardQuery = z.infer<typeof DashboardQuery>;

// ── Report schedules ────────────────────────────────────────────────────────────

export const ReportSchedule = z.object({
  id: uuid,
  name: z.string(),
  report_key: z.string(),
  cron: z.string(),
  recipients: z.array(z.string().email()),
  format: exportFormat,
  params: z.record(z.unknown()),
  is_active: z.boolean(),
  version: z.number().int().nonnegative(),
});
export type ReportSchedule = z.infer<typeof ReportSchedule>;

export const CreateReportScheduleRequest = z.object({
  name: z.string().min(1),
  report_key: z.string().min(1),
  cron: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
  format: exportFormat,
  params: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
});
export type CreateReportScheduleRequest = z.infer<typeof CreateReportScheduleRequest>;

export const UpdateReportScheduleRequest = z.object({
  name: z.string().min(1).optional(),
  report_key: z.string().min(1).optional(),
  cron: z.string().min(1).optional(),
  recipients: z.array(z.string().email()).min(1).optional(),
  format: exportFormat.optional(),
  params: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateReportScheduleRequest = z.infer<typeof UpdateReportScheduleRequest>;

export const ReportSchedulesQuery = paginationQuery;
export type ReportSchedulesQuery = z.infer<typeof ReportSchedulesQuery>;

// ── Router ────────────────────────────────────────────────────────────────────

export const reportingContract = c.router(
  {
    // Reports (report.<group>.view; cost/profit also require inventory.cost.view)
    getReport: {
      method: "GET",
      path: "/reports/:report_key",
      pathParams: z.object({ report_key: z.string() }),
      query: ReportQuery,
      responses: withErrors({ 200: ReportResult }),
      summary: "Read-only tabular report from the reporting materialized views (404 if unknown)",
    },
    exportReport: {
      method: "POST",
      path: "/reports/:report_key/export",
      pathParams: z.object({ report_key: z.string() }),
      body: ExportReportRequest,
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue an async report export job (Excel | CSV | PDF)",
    },
    getExport: {
      method: "GET",
      path: "/exports/:job_id",
      pathParams: z.object({ job_id: z.string() }),
      responses: withErrors({ 200: ExportStatusResult }),
      summary: "Get export job status and, once DONE, a signed download URL",
    },

    // Dashboards (report.<group>.view)
    getDashboard: {
      method: "GET",
      path: "/dashboards/:key",
      pathParams: z.object({ key: z.string() }),
      query: DashboardQuery,
      responses: withErrors({ 200: DashboardResult }),
      summary: "Cross-filtered dashboard panels (one dimension/value filter set applies to all)",
    },

    // Report schedules (report.schedule.manage)
    listReportSchedules: {
      method: "GET",
      path: "/report-schedules",
      query: ReportSchedulesQuery,
      responses: withErrors({ 200: paginated(ReportSchedule) }),
      summary: "List report schedules",
    },
    createReportSchedule: {
      method: "POST",
      path: "/report-schedules",
      body: CreateReportScheduleRequest,
      responses: withErrors({ 201: z.object({ schedule: ReportSchedule }) }),
      summary: "Create a report schedule (registers its repeatable cron job when active)",
    },
    updateReportSchedule: {
      method: "PUT",
      path: "/report-schedules/:id",
      pathParams: z.object({ id: uuid }),
      headers: ifMatchHeader,
      body: UpdateReportScheduleRequest,
      responses: withErrors({ 200: z.object({ schedule: ReportSchedule }) }),
      summary:
        "Update a report schedule (If-Match; 409 on version conflict; upserts/removes its " +
        "cron job on cron/is_active change)",
    },
    deleteReportSchedule: {
      method: "DELETE",
      path: "/report-schedules/:id",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 204: z.void() }),
      summary: "Delete a report schedule (removes its repeatable cron job)",
    },
    runReportScheduleNow: {
      method: "POST",
      path: "/report-schedules/:id/run-now",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue an immediate one-off render-and-send of a report schedule",
    },
  },
  { pathPrefix: API_PREFIX },
);
