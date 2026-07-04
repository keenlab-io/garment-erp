import { boolean, integer, pgTable, text, unique } from "drizzle-orm/pg-core";

// Document number generator source (spec §0.6). Exactly ONE row per key: yearly
// rollover updates this row's `year_scope` in place (never inserts a per-year row),
// so `SELECT ... WHERE key = $1 FOR UPDATE` always locks exactly one row (M0
// design D9). `current_value` is bumped atomically under that lock by SequenceService.
export const documentSequence = pgTable(
  "document_sequence",
  {
    key: text().primaryKey(),
    prefix: text().notNull(),
    includeYear: boolean().notNull().default(true),
    padding: integer().notNull().default(4),
    resetYearly: boolean().notNull().default(true),
    currentValue: integer().notNull().default(0),
    format: text().notNull(),
    yearScope: integer().notNull(),
  },
  (t) => [unique("document_sequence_key_year_scope_uq").on(t.key, t.yearScope)],
);
