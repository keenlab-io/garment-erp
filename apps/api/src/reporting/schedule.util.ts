import type { reportSchedule } from "@erp/db";
import {
  ReportExportFormat,
  type ReportExportFormat as ReportExportFormatT,
  type ReportSchedule,
} from "@erp/contracts";

/** Deterministic BullMQ job-scheduler id for a schedule row — one repeatable job per schedule. */
export function scheduleSchedulerId(scheduleId: string): string {
  return `reporting.schedule:${scheduleId}`;
}

/** Narrow a stored `format` string to the export-format union (defaults to PDF if unexpected). */
function toFormat(value: string): ReportExportFormatT {
  return (Object.values(ReportExportFormat) as string[]).includes(value)
    ? (value as ReportExportFormatT)
    : ReportExportFormat.PDF;
}

/** Map a `report_schedule` row to the `ReportSchedule` wire DTO. */
export function toScheduleDto(row: typeof reportSchedule.$inferSelect): ReportSchedule {
  return {
    id: row.id,
    name: row.name,
    report_key: row.reportKey,
    cron: row.cron,
    recipients: row.recipients,
    format: toFormat(row.format),
    params: (row.params ?? {}) as Record<string, unknown>,
    is_active: row.isActive,
    version: row.version,
  };
}
