import { sql } from "drizzle-orm";
import { date, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { money, rate, tenantColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";

// Payroll parameters (design D3) — admin-editable, effective-dated config tables. The
// payroll engine selects the current-effective row(s) (`effective_date <= period`) at
// calculation time and snapshots the resolved values into `payslip.breakdown`. All values
// here are **non-authoritative** — flagged for accountant confirmation (spec §2.5) — and
// never used as a source of legal truth.

// Progressive withholding-tax band. Bands sharing an `effective_date` form one schedule:
// income within `[lower_bound, upper_bound)` is taxed at `rate` (fraction, e.g. 0.05).
// `upper_bound` null marks the open-ended top band. `rate` is numeric(9,6).
export const taxBracket = pgTable(
  "tax_bracket",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    effectiveDate: date().notNull(),
    lowerBound: money().notNull(),
    upperBound: money(),
    rate: rate().notNull(),
  },
  (t) => [tenantFk(t)],
);

// Social-security config. `rate` (fraction) applies to monthly wage clamped to
// `[wage_floor, wage_ceiling]`. One current-effective row per date.
export const ssoConfig = pgTable(
  "sso_config",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    effectiveDate: date().notNull(),
    rate: rate().notNull(),
    wageFloor: money().notNull().default("0"),
    wageCeiling: money().notNull(),
  },
  (t) => [tenantFk(t)],
);

// OT rate multiplier per `rate_type` (e.g. `WEEKDAY_1_5` → 1.5, `HOLIDAY_3_0` → 3.0). The OT
// engine resolves the current-effective row for a request's `rate_type`. `multiplier` is
// numeric(9,6).
export const otRate = pgTable(
  "ot_rate",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    effectiveDate: date().notNull(),
    rateType: text().notNull(),
    multiplier: rate().notNull(),
  },
  (t) => [tenantFk(t)],
);

// Cash-advance policy. `ceiling_pct` caps a request at that fraction of the employee's base
// salary; `max_installments` bounds INSTALLMENT repayment plans. Effective-dated.
export const advancePolicy = pgTable(
  "advance_policy",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    effectiveDate: date().notNull(),
    ceilingPct: rate().notNull(),
    maxInstallments: integer().notNull().default(1),
  },
  (t) => [tenantFk(t)],
);
