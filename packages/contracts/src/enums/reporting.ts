// M6 — Reporting & Analytics enums (spec §6, design D2/D4/D7). Export job lifecycle, export
// file formats, and the five report-catalog groups (`report.<group>.view` RBAC). Keep in sync
// with @erp/db/schema/enums.ts (parity is asserted by test).

// Export job output format (spec §6.5 `POST /reports/{report_key}/export`). Named
// `ReportExportFormat` — `ExportFormat` is already taken by the M5 sales invoice export DTO.
export const ReportExportFormat = {
  PDF: "PDF",
  EXCEL: "EXCEL",
  CSV: "CSV",
} as const;
export type ReportExportFormat = (typeof ReportExportFormat)[keyof typeof ReportExportFormat];

// Async export job lifecycle (spec §6.5 `GET /exports/{job_id}`). PENDING/RUNNING carry no
// `file_url`; DONE returns a signed download URL; FAILED never produces one.
export const ExportStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const;
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

// The five report-catalog groups (spec §6.2/D4/D5) — each report_key belongs to exactly one
// group, gating access via `report.<group>.view` (lowercased); COST/PROFIT additionally
// require `inventory.cost.view`.
export const ReportGroup = {
  INVENTORY: "INVENTORY",
  SALES: "SALES",
  COST: "COST",
  PROFIT: "PROFIT",
  TAX: "TAX",
} as const;
export type ReportGroup = (typeof ReportGroup)[keyof typeof ReportGroup];
