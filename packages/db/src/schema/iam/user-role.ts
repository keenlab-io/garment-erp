import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { tenantColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";
import { user } from "../platform/users.js";
import { role } from "./roles.js";

// User↔role assignment (spec §1.2). Composite PK `(user_id, role_id)`. The `user_id` FK
// cascades so removing a user drops their assignments; the `role_id` FK does NOT cascade —
// a role bound to any user cannot be deleted (the delete path checks for bound users and
// returns 409 rather than orphaning, M1 design D6).
export const userRole = pgTable(
  "user_role",
  {
    ...tenantColumn,
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => role.id),
  },
  (t) => [tenantFk(t), primaryKey({ columns: [t.userId, t.roleId] })],
);
