import { boolean, integer, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { tenantColumn } from "../../base-columns.js";
import { tenantFk } from "./tenant.js";

// Document number generator source (spec §0.6). Exactly ONE row per (tenant, key): yearly
// rollover updates this row's `year_scope` in place (never inserts a per-year row),
// so `SELECT ... WHERE key = $1 FOR UPDATE` always locks exactly one row (M0
// design D9). `current_value` is bumped atomically under that lock by SequenceService.
// PK `(tenant_id, key)` (M7 design D9): every tenant numbers from 1, and RLS scopes the
// lock to the caller's tenant row.
export const documentSequence = pgTable(
  "document_sequence",
  {
    ...tenantColumn,
    key: text().notNull(),
    prefix: text().notNull(),
    includeYear: boolean().notNull().default(true),
    padding: integer().notNull().default(4),
    resetYearly: boolean().notNull().default(true),
    currentValue: integer().notNull().default(0),
    format: text().notNull(),
    yearScope: integer().notNull(),
  },
  (t) => [
    tenantFk(t),
    primaryKey({ columns: [t.tenantId, t.key] }),
    unique("document_sequence_tenant_key_year_scope_uq").on(t.tenantId, t.key, t.yearScope),
  ],
);
