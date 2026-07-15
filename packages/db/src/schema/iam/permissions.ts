import { sql } from "drizzle-orm";
import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { role } from "./roles.js";

// Persisted mirror of the `@erp/contracts` PERMISSIONS catalog (M1 design D8). Seeded
// from `permission-catalog.ts` (which duplicates the catalog — `@erp/db` may not import
// `@erp/contracts`; a parity test keeps the two in lockstep). `code` follows
// `module.resource.action` and is unique; roles reference permissions by id.
export const permission = pgTable("permission", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: text().notNull().unique(),
});

// Role↔permission grant. Composite PK `(role_id, permission_id)`; both FKs cascade so a
// deleted role or permission drops its grants (deleting a role is otherwise blocked while
// users are bound — see M1 design D6).
export const rolePermission = pgTable(
  "role_permission",
  {
    roleId: uuid()
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    permissionId: uuid()
      .notNull()
      .references(() => permission.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);
