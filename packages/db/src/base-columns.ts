import { isNull, sql, type Column } from "drizzle-orm";
import { customType, integer, numeric, timestamp, uuid } from "drizzle-orm/pg-core";

// Case-insensitive text (Postgres `citext`). Requires the `citext` extension,
// created by the first migration. Used for unique username/email.
export const citext = customType<{ data: string }>({ dataType: () => "citext" });

// Shared audit columns every module table spreads. NOTE: `created_by`/`updated_by`
// are plain uuids here — their FK to `user.id` is declared PER-TABLE, not in this
// helper, to avoid a users↔base-columns cycle (M0 design R3/R6).
export const auditColumns = {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid(),
  updatedBy: uuid(),
  deletedAt: timestamp({ withTimezone: true }),
};

// The deterministic id of the default tenant (`slug 'default'`). Migration 0012 inserts it
// and backfills every pre-tenancy row into it; the dev seed creates the same row.
export const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_TENANT_SLUG = "default";

// Tenant scope (M7). Every business table spreads this; the default reads the
// transaction-local `app.tenant_id` GUC that UnitOfWork sets, so inserts inherit the
// ambient tenant without naming it. The FK to `tenant.id` is declared PER-TABLE via
// `tenantFk` (`schema/platform/tenant.ts`), not here — same cycle-avoidance rule as
// `created_by`. Every natural-key unique on a tenant table is composite `(tenant_id, …)`:
// "unique" in the table comments means unique within one tenant.
//
// Fail-closed (M7 design D1/D17, migration 0013): no tenant in scope → NULL → the NOT NULL
// constraint rejects the write, and the `tenant_isolation` RLS policy's WITH CHECK agrees.
// `nullif` because a GUC reset at the end of a pooled connection's earlier transaction reads
// as '' rather than NULL — it must fail the same way, not as a uuid cast error.
export const tenantColumn = {
  tenantId: uuid()
    .notNull()
    .default(sql.raw(`nullif(current_setting('app.tenant_id', true), '')::uuid`)),
};

// Optimistic-concurrency version counter.
export const versionColumn = { version: integer().notNull().default(0) };

// Money/quantity/rate cross the wire as strings (postgres.js returns numeric as a
// string) — never floats. Precision per spec: money 18,4 · qty 18,6 · rate 9,6.
export const money = (name?: string) =>
  name ? numeric(name, { precision: 18, scale: 4 }) : numeric({ precision: 18, scale: 4 });
export const qty = (name?: string) =>
  name ? numeric(name, { precision: 18, scale: 6 }) : numeric({ precision: 18, scale: 6 });
export const rate = (name?: string) =>
  name ? numeric(name, { precision: 9, scale: 6 }) : numeric({ precision: 9, scale: 6 });

// Predicate for filtering out soft-deleted rows: `deleted_at IS NULL`.
// `isNull` lives in `drizzle-orm`, NOT `drizzle-orm/pg-core` (M0 plan §3).
export const notDeleted = (deletedAt: Column) => isNull(deletedAt);
