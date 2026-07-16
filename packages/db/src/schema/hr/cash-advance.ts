import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { money, versionColumn } from "../../base-columns.js";
import type { CashAdvanceStatus } from "../enums.js";
import { user } from "../platform/users.js";
import { employee } from "./employee.js";

// Cash advance (spec §2.2). The ceiling is checked at SUBMITTED; approval requires a
// super-admin. `repayment_plan` jsonb is `{ mode: 'LUMP'|'INSTALLMENT', installments?: n }`;
// `outstanding` (money) is set to `amount` on disburse and decremented by payroll deductions
// until it reaches zero (→ CLEARED). Carries the optimistic-concurrency version column.
export const cashAdvance = pgTable("cash_advance", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  employeeId: uuid()
    .notNull()
    .references(() => employee.id),
  amount: money().notNull(),
  reason: text(),
  status: text().$type<CashAdvanceStatus>().notNull().default("SUBMITTED"),
  approverId: uuid().references(() => user.id),
  repaymentPlan: jsonb(),
  outstanding: money().notNull().default("0"),
  ...versionColumn,
});
