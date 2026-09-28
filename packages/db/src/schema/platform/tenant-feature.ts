import { boolean, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { tenantColumn } from "../../base-columns.js";
import { tenantFk } from "./tenant.js";

// Per-tenant feature/module override (M8 design D2) — explicit row beats `plan.features`'
// default, absent from both means off. PK (tenant_id, key): one override per key per tenant.
// Unlike the rest of the control plane this table DOES carry `tenant_id` and gets RLS like
// any business table — platform-admin writes reach it through the one control-plane path
// that sets `app.tenant_id` to the target tenant explicitly (a platform-admin token has no
// ambient tenant).
export const tenantFeature = pgTable(
  "tenant_feature",
  {
    ...tenantColumn,
    key: text().notNull(),
    enabled: boolean().notNull(),
  },
  (t) => [tenantFk(t), primaryKey({ columns: [t.tenantId, t.key] })],
);
