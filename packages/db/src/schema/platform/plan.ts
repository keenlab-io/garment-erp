import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { auditColumns, versionColumn } from "../../base-columns.js";
import type { PlanCode } from "../enums.js";

// Commercial plan catalog (M8 design D10) — seed data, editable only by platform admins.
// Exempt from `tenantColumn`/RLS: plans are a shared catalog, not tenant data. `features` is
// a jsonb `key -> boolean` map of defaults; a tenant's `tenant_feature` rows override per key,
// then off. Pricing columns are deliberately absent — M9 adds them with the subscription model.
export const plan = pgTable("plan", {
  ...auditColumns,
  code: text().$type<PlanCode>().notNull().unique(),
  includedSeats: integer().notNull(),
  features: jsonb().notNull().default({}),
  ...versionColumn,
});
