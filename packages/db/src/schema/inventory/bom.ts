import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { money, qty, rate } from "../../base-columns.js";
import { item, uom } from "./catalog.js";

// Bill of materials (spec §3.2) — the recipe rolled up for costing and consumed by
// backflush. Pure structural data; no ledger writes originate here.

// BOM header. One finished item may have several versions; `version` is the BOM revision
// (business-meaningful, starts at 1 — NOT the optimistic-concurrency counter).
// `conversion_cost` is optional labor+overhead per unit added on top of rolled-up material
// cost. `UNIQUE (finished_item_id, version)`.
export const bom = pgTable(
  "bom",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    finishedItemId: uuid()
      .notNull()
      .references(() => item.id),
    version: integer().notNull().default(1),
    conversionCost: money(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [unique().on(t.finishedItemId, t.version)],
);

// BOM component line. `qty` (in `uom_id`) of `raw_item_id` per finished unit; `scrap_pct`
// inflates the required qty during roll-up/backflush.
export const bomLine = pgTable("bom_line", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bomId: uuid()
    .notNull()
    .references(() => bom.id),
  rawItemId: uuid()
    .notNull()
    .references(() => item.id),
  qty: qty().notNull(),
  uomId: uuid()
    .notNull()
    .references(() => uom.id),
  scrapPct: rate().notNull().default("0"),
});
