import { sql } from "drizzle-orm";
import { jsonb, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { auditColumns, money, qty, tenantColumn, versionColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";
import type { CostingMethod, ItemType } from "../enums.js";

// Item catalog & unit-of-measure tables (spec §3.2). The item master, its SKU variants,
// the UOM registry + per-item conversions, and the warehouse (stock location) list.

// Unit of measure. `code` is unique when set (e.g. `KG`, `M`, `PCS`). An item's canonical
// unit is its `base_uom_id`; all ledger quantities are stored in that base unit.
export const uom = pgTable(
  "uom",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    code: text(),
    name: text(),
  },
  (t) => [
    tenantFk(t),
    unique("uom_tenant_code_uq").on(t.tenantId, t.code),
  ],
);

// Item master. `code` is auto-issued (`AA00001`) via SequenceService on create and is
// unique. `costing_method` defaults to MAV; `standard_cost` is the STANDARD/variance
// baseline, `min_stock` drives the LowStockReached event. `attributes` is a free-form
// jsonb bag. Spreads the shared audit + optimistic-concurrency columns.
export const item = pgTable(
  "item",
  {
    ...auditColumns,
    ...tenantColumn,
    code: text().notNull(),
    name: text().notNull(),
    itemType: text().$type<ItemType>().notNull(),
    baseUomId: uuid()
      .notNull()
      .references(() => uom.id),
    costingMethod: text().$type<CostingMethod>().notNull().default("MAV"),
    standardCost: money(),
    minStock: qty(),
    attributes: jsonb().notNull().default({}),
    ...versionColumn,
  },
  (t) => [
    tenantFk(t),
    unique("item_tenant_code_uq").on(t.tenantId, t.code),
  ],
);

// SKU variant of an item. `sku_code` is auto-issued and unique; `variant` is a jsonb
// descriptor (`{ color, size, collection }`); `barcode` is unique when set.
export const sku = pgTable(
  "sku",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    itemId: uuid()
      .notNull()
      .references(() => item.id),
    skuCode: text().notNull(),
    variant: jsonb().notNull().default({}),
    barcode: text(),
  },
  (t) => [
    tenantFk(t),
    unique("sku_tenant_sku_code_uq").on(t.tenantId, t.skuCode),
    unique("sku_tenant_barcode_uq").on(t.tenantId, t.barcode),
  ],
);

// Per-item UOM conversion: `1 from_uom = factor × to_uom`. Composite PK
// `(item_id, from_uom, to_uom)`. Quantities are converted to the item's base_uom via these
// rows **before** anything is written to the stock ledger (invariant §3.5).
export const uomConversion = pgTable(
  "uom_conversion",
  {
    ...tenantColumn,
    itemId: uuid()
      .notNull()
      .references(() => item.id),
    fromUom: uuid()
      .notNull()
      .references(() => uom.id),
    toUom: uuid()
      .notNull()
      .references(() => uom.id),
    factor: qty().notNull(),
  },
  (t) => [tenantFk(t), primaryKey({ columns: [t.itemId, t.fromUom, t.toUom] })],
);

// Stock location. Balances and movements are keyed per warehouse, so the ledger and
// `stock_balance` cache are both scoped `(item_id, warehouse_id)`.
export const warehouse = pgTable(
  "warehouse",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    name: text().notNull(),
  },
  (t) => [tenantFk(t)],
);
