import { sql } from "drizzle-orm";
import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { money, qty } from "../../base-columns.js";
import type { MovementDirection, MovementRefType } from "../enums.js";
import { item, sku, warehouse } from "./catalog.js";

// The stock ledger (spec §3.2) — received lots, the append-only movement log, and the
// derived balance cache.

// A received lot of an item. `qty_remaining` (in base_uom) is decremented oldest-first by
// FIFO issues; `unit_cost` is the landed unit cost captured at receipt posting. `barcode`
// is unique when set. `supplier_id` has no FK yet (the M6 supplier table adds it).
export const stockLot = pgTable("stock_lot", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  itemId: uuid()
    .notNull()
    .references(() => item.id),
  lotNo: text().notNull(),
  barcode: text().unique(),
  supplierId: uuid(),
  qtyRemaining: qty().notNull(),
  unitCost: money().notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// THE STOCK LEDGER — append-only: rows are never UPDATEd or DELETEd, and that immutability
// is enforced at the DB level by a BEFORE UPDATE OR DELETE trigger (custom migration
// `stock_movement_append_only`, mirroring `audit_log`), so it holds even for the table
// owner. Corrections are new compensating movements, never edits (invariant §3.5).
//
// `qty` is in base_uom, signed by `direction` (IN + / OUT − / ADJUST ±). `ref_type` +
// `ref_id` trace each row back to the receipt/issue/adjustment/count/backflush that
// produced it. `stock_balance` is a derived cache reconstructable by replaying these.
export const stockMovement = pgTable(
  "stock_movement",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    itemId: uuid()
      .notNull()
      .references(() => item.id),
    skuId: uuid().references(() => sku.id),
    lotId: uuid().references(() => stockLot.id),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouse.id),
    qty: qty().notNull(),
    direction: text().$type<MovementDirection>().notNull(),
    unitCost: money().notNull(),
    refType: text().$type<MovementRefType>().notNull(),
    refId: uuid().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.itemId, t.warehouseId, t.at)],
);

// Derived performance cache (invariant §3.5): every ledger insert updates the matching
// `(item_id, warehouse_id)` row in the same transaction, and the whole table must be
// reconstructable by replaying `stock_movement`. `qty_on_hand` is the running balance;
// `avg_cost` is the moving-average unit cost (MAV). No FKs (mirrors spec); composite PK.
export const stockBalance = pgTable(
  "stock_balance",
  {
    itemId: uuid().notNull(),
    warehouseId: uuid().notNull(),
    qtyOnHand: qty().notNull().default("0"),
    avgCost: money().notNull().default("0"),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.warehouseId] })],
);
