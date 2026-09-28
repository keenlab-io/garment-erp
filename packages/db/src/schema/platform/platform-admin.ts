import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, citext, versionColumn } from "../../base-columns.js";
import type { UserStatus } from "../enums.js";
import { tenant } from "./tenant.js";

// Platform-admin principal (M7 design D6) — the control-plane operator, separate from every
// tenant's `user` table and from the tenant-scoped `user.is_super_admin`. Exempt from
// `tenantColumn`/RLS: a platform admin belongs to no tenant. `email` is citext unique.
// Admins are provisioned by ops, so the account starts ACTIVE (no invite flow).
export const platformAdmin = pgTable("platform_admin", {
  ...auditColumns,
  email: citext().notNull().unique(),
  passwordHash: text().notNull(),
  status: text().$type<UserStatus>().notNull().default("ACTIVE"),
  failedLoginCount: integer().notNull().default(0),
  lockedUntil: timestamp({ withTimezone: true }),
  ...versionColumn,
});

// Support session — the only way a platform admin enters a tenant: explicit, time-boxed
// (`expires_at` NOT NULL), reason-tagged (`reason` NOT NULL), revocable, and fully audited.
// `token_id` is the jti of the support-scoped access token (the `sup` claim). Control-plane
// data, so exempt from RLS even though it names a tenant.
export const supportSession = pgTable(
  "support_session",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    platformAdminId: uuid()
      .notNull()
      .references(() => platformAdmin.id),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    reason: text().notNull(),
    tokenId: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("support_session_tenant_idx").on(t.tenantId)],
);

// Platform-admin session (M8 design D7) — one row per issued platform token pair, the
// control-plane twin of the tenant `session` table. `token_id` is the `sid` claim both
// platform tokens carry; `PlatformJwtGuard` refuses a token whose row is revoked (logout) or
// expired. Exempt from `tenantColumn`/RLS like its `platform_admin` parent.
export const platformSession = pgTable(
  "platform_session",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    platformAdminId: uuid()
      .notNull()
      .references(() => platformAdmin.id),
    tokenId: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("platform_session_admin_idx").on(t.platformAdminId)],
);
