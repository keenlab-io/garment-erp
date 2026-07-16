import { sql } from "drizzle-orm";
import { date, pgTable, primaryKey, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { qty, versionColumn } from "../../base-columns.js";
import type { OtRequestStatus } from "../enums.js";
import { user } from "../platform/users.js";
import { employee } from "./employee.js";

// OT requests & attendance (spec §2.2). OT pay = approved_hours × hourly_rate ×
// rate_multiplier, where approved_hours = min(requested, attended) is fixed at reconcile.

// OT request. `rate_type` (e.g. `WEEKDAY_1_5`, `HOLIDAY_3_0`) resolves a multiplier from the
// current-effective `ot_rate` config row. `approved_hours` (qty, numeric(18,6)) is null until
// reconciliation clamps it to the attended hours. `approver_id` FKs the approving `user`.
// Carries the optimistic-concurrency version column.
export const otRequest = pgTable("ot_request", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  employeeId: uuid()
    .notNull()
    .references(() => employee.id),
  workDate: date().notNull(),
  startTime: time().notNull(),
  endTime: time().notNull(),
  reason: text(),
  rateType: text().notNull(),
  approvedHours: qty(),
  status: text().$type<OtRequestStatus>().notNull().default("DRAFT"),
  approverId: uuid().references(() => user.id),
  ...versionColumn,
});

// Attendance (spec §2.2). One row per employee per day — composite PK `(employee_id,
// work_date)`, so an import upserts. `source` records the origin (default IMPORT). Attended
// hours derived from `clock_in`/`clock_out` cap OT at reconcile.
export const attendance = pgTable(
  "attendance",
  {
    employeeId: uuid()
      .notNull()
      .references(() => employee.id),
    workDate: date().notNull(),
    clockIn: timestamp({ withTimezone: true }),
    clockOut: timestamp({ withTimezone: true }),
    source: text().notNull().default("IMPORT"),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.workDate] })],
);
