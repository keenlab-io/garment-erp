import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { money, versionColumn } from "../../base-columns.js";
import type { PayrollRunStatus } from "../enums.js";
import { user } from "../platform/users.js";
import { employee } from "./employee.js";

// Payroll runs & payslips (spec §2.2). A run computes one payslip per active employee,
// snapshotting every input into the immutable `breakdown`. Money is numeric(18,4).

// Payroll run header. `period` is a `YYYY-MM` label and is UNIQUE (one run per month).
// Lifecycle DRAFT → CALCULATED → APPROVED → PAID → CLOSED (no backward transitions);
// `approved_by` FKs the approving `user`. Carries the optimistic-concurrency version column.
export const payrollRun = pgTable("payroll_run", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  period: text().notNull().unique(),
  status: text().$type<PayrollRunStatus>().notNull().default("DRAFT"),
  approvedBy: uuid().references(() => user.id),
  ...versionColumn,
});

// Payslip (spec §2.2). One per `(run_id, employee_id)` — the UNIQUE makes the calculate
// worker idempotent (upsert on re-enqueue). `breakdown` jsonb is the immutable snapshot
// `{ base, ot, allowances[], deductions[], sso, tax, advance }`; `gross`/`net` are the
// resolved totals. `pdf_key` is the object-storage key of the encrypted PDF (null until the
// payslip is generated).
export const payslip = pgTable(
  "payslip",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: uuid()
      .notNull()
      .references(() => payrollRun.id),
    employeeId: uuid()
      .notNull()
      .references(() => employee.id),
    breakdown: jsonb().notNull(),
    gross: money().notNull(),
    net: money().notNull(),
    pdfKey: text(),
  },
  (t) => [unique("payslip_run_employee_uq").on(t.runId, t.employeeId)],
);
