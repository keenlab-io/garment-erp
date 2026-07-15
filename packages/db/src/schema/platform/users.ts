import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { auditColumns, citext, versionColumn } from "../../base-columns.js";
import type { UserStatus } from "../enums.js";

// Platform `user` table — owned by M0; M1 extends it (employeeId, roles) but never
// redefines it. `username`/`email` are citext so uniqueness is case-insensitive.
// `created_by`/`updated_by` FKs are declared here (self-referential) rather than in
// `auditColumns`, avoiding a users↔base-columns cycle (M0 design R3/R6).
export const user = pgTable("user", {
  ...auditColumns,
  // Self-referential FKs — the `AnyPgColumn` return annotation breaks the circular
  // type inference drizzle would otherwise hit for a same-table reference.
  createdBy: uuid().references((): AnyPgColumn => user.id),
  updatedBy: uuid().references((): AnyPgColumn => user.id),
  // Link to the HR employee record. Nullable and WITHOUT an FK constraint for now — the
  // `employee` table arrives with M2, which adds the FK in its own migration (M1 plan §2).
  employeeId: uuid(),
  username: citext().notNull().unique(),
  email: citext().notNull().unique(),
  passwordHash: text().notNull(),
  status: text().$type<UserStatus>().notNull().default("PENDING"),
  permissionsVersion: integer().notNull().default(1),
  isSuperAdmin: boolean().notNull().default(false),
  failedLoginCount: integer().notNull().default(0),
  lockedUntil: timestamp({ withTimezone: true }),
  lastLoginAt: timestamp({ withTimezone: true }),
  ...versionColumn,
});
