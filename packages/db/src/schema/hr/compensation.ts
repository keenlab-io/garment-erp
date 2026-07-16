import { sql } from "drizzle-orm";
import { boolean, date, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { money } from "../../base-columns.js";
import type { PayComponentType } from "../enums.js";
import { user } from "../platform/users.js";
import { employee } from "./employee.js";

// Salary history & pay components (spec §2.2). Money crosses the wire as a string — the
// `money()` helper is numeric(18,4).

// Salary record — append-only history. The employee's current salary is the row with the
// latest `effective_date <= today`. `created_by` records who set it (FK to `user`).
export const salaryRecord = pgTable("salary_record", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  employeeId: uuid()
    .notNull()
    .references(() => employee.id),
  baseSalary: money().notNull(),
  effectiveDate: date().notNull(),
  createdBy: uuid().references(() => user.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Pay component catalog (spec §2.2). `type` is ALLOWANCE (adds to gross) or DEDUCTION
// (subtracts from net); `recurring` marks components applied every period by default.
export const payComponent = pgTable("pay_component", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: text().$type<PayComponentType>().notNull(),
  name: text().notNull(),
  defaultAmount: money().notNull().default("0"),
  recurring: boolean().notNull().default(true),
});

// Per-employee pay-component override (spec §2.2). Composite PK `(employee_id,
// pay_component_id)`; `amount` overrides the component's `default_amount` for that employee.
export const employeePayComponent = pgTable(
  "employee_pay_component",
  {
    employeeId: uuid()
      .notNull()
      .references(() => employee.id),
    payComponentId: uuid()
      .notNull()
      .references(() => payComponent.id),
    amount: money().notNull(),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.payComponentId] })],
);
