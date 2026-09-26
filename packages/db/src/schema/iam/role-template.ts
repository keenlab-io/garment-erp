import { sql } from "drizzle-orm";
import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { tenantColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";

// Reusable permission preset (spec §1.2). Creating a role from a template copies its
// `default_permission_ids` into fresh `role_permission` rows. `name` is unique; the id
// array defaults to empty so a template with no permissions is valid.
export const roleTemplate = pgTable(
  "role_template",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    name: text().notNull(),
    defaultPermissionIds: uuid("default_permission_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
  },
  (t) => [
    tenantFk(t),
    unique("role_template_tenant_name_uq").on(t.tenantId, t.name),
  ],
);
