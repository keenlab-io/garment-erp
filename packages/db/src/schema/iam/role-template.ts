import { sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

// Reusable permission preset (spec §1.2). Creating a role from a template copies its
// `default_permission_ids` into fresh `role_permission` rows. `name` is unique; the id
// array defaults to empty so a template with no permissions is valid.
export const roleTemplate = pgTable("role_template", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text().notNull().unique(),
  defaultPermissionIds: uuid("default_permission_ids")
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
});
