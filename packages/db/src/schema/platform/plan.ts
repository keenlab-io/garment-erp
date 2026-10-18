import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { auditColumns, money, versionColumn } from "../../base-columns.js";
import type { PlanCode } from "../enums.js";

// Commercial plan catalog (M8 design D10) — seed data, editable only by platform admins.
// Exempt from `tenantColumn`/RLS: plans are a shared catalog, not tenant data. `features` is
// a jsonb `key -> boolean` map of defaults; a tenant's `tenant_feature` rows override per key,
// then off. The `*_min`/`*_max` columns (M9 design D7) are informational list-price ranges for the
// console; the negotiated fee lives on `subscription.annual_fee`. Null = quoted per deal.
export const plan = pgTable("plan", {
  ...auditColumns,
  code: text().$type<PlanCode>().notNull().unique(),
  includedSeats: integer().notNull(),
  features: jsonb().notNull().default({}),
  annualFeeMin: money(),
  annualFeeMax: money(),
  setupFeeMin: money(),
  setupFeeMax: money(),
  ...versionColumn,
});
