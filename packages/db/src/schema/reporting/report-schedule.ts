import { boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { auditColumns, versionColumn } from "../../base-columns.js";
import type { ReportExportFormat } from "../enums.js";

// M6 report schedules (design D3) — the only write table in the reporting module. Each active
// row drives a BullMQ repeatable job (`repeat: { pattern: cron }`) that renders `report_key`
// and emails it to `recipients`; `params` carries the report's query params. `recipients` is
// the schema's first array column.
export const reportSchedule = pgTable("report_schedule", {
  ...auditColumns,
  name: text().notNull(),
  reportKey: text().notNull(),
  cron: text().notNull(),
  recipients: text().array().notNull(),
  format: text().$type<ReportExportFormat>().notNull(),
  params: jsonb().notNull().default({}),
  isActive: boolean().notNull().default(true),
  ...versionColumn,
});
