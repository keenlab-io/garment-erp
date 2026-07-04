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
