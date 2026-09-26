import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { auditColumns, citext, tenantColumn, versionColumn } from "../../base-columns.js";
import { tenantFk } from "./tenant.js";
import type { UserStatus } from "../enums.js";
import { employee } from "../hr/employee.js";

// Platform `user` table — owned by M0; M1 extends it (employeeId, roles) but never
// redefines it. `username`/`email` are citext so uniqueness is case-insensitive.
// `created_by`/`updated_by` FKs are declared here (self-referential) rather than in
// `auditColumns`, avoiding a users↔base-columns cycle (M0 design R3/R6).
export const user = pgTable(
  "user",
  {
    ...auditColumns,
    ...tenantColumn,
    // Self-referential FKs — the `AnyPgColumn` return annotation breaks the circular
    // type inference drizzle would otherwise hit for a same-table reference.
    createdBy: uuid().references((): AnyPgColumn => user.id),
    updatedBy: uuid().references((): AnyPgColumn => user.id),
    // Link to the HR employee record. Nullable; the FK to `employee(id)` is added by M2 now
    // that the table exists (M1 shipped the bare column, M2 plan §2 task 2.9).
    employeeId: uuid().references(() => employee.id),
    username: citext().notNull(),
    email: citext().notNull(),
    passwordHash: text().notNull(),
    status: text().$type<UserStatus>().notNull().default("PENDING"),
    permissionsVersion: integer().notNull().default(1),
    isSuperAdmin: boolean().notNull().default(false),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...versionColumn,
  },
  (t) => [
    tenantFk(t),
    unique("user_tenant_username_uq").on(t.tenantId, t.username),
    unique("user_tenant_email_uq").on(t.tenantId, t.email),
  ],
);
