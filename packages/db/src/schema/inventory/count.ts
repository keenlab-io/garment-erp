import { sql } from "drizzle-orm";
import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { qty, tenantColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";
import type { StockAdjustmentStatus, StockCountStatus } from "../enums.js";
import { item, warehouse } from "./catalog.js";

// Physical stock counts and reason-gated adjustments (spec §3.2). Both reconcile to the
// ledger via ADJUST movements on their terminal state.

// Stock count header. Lifecycle OPEN → COUNTING (lock item movement) → RECONCILED →
// ADJUSTED → CLOSED. `period` is a free-form label for the count cycle.
export const stockCount = pgTable(
  "stock_count",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    period: text(),
    status: text().$type<StockCountStatus>().notNull().default("OPEN"),
  },
  (t) => [tenantFk(t)],
);

// Stock count line. `system_qty` snapshots on-hand at count time; `counted_qty` is the
// physical tally (null until counted). Reconcile turns the delta into an adjustment.
// Composite PK `(count_id, item_id)`.
export const stockCountLine = pgTable(
  "stock_count_line",
  {
    ...tenantColumn,
    countId: uuid()
      .notNull()
      .references(() => stockCount.id),
    itemId: uuid()
      .notNull()
      .references(() => item.id),
    systemQty: qty().notNull(),
    countedQty: qty(),
  },
  (t) => [tenantFk(t), primaryKey({ columns: [t.countId, t.itemId] })],
);

// Stock adjustment header. Lifecycle DRAFT → APPROVED → POSTED (ledger ADJUST). `reason` is
// mandatory (NOT NULL) — an adjustment without a reason is rejected before any state change
// (invariant §3.5) and the reason lands on the audit_log row. `approved_by` records the
// approver (no FK — the platform `user` lives in a different module).
export const stockAdjustment = pgTable(
  "stock_adjustment",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    reason: text().notNull(),
    status: text().$type<StockAdjustmentStatus>().notNull().default("DRAFT"),
    approvedBy: uuid(),
  },
  (t) => [tenantFk(t)],
);

// Stock adjustment line. `delta_qty` is the signed change (in base_uom) applied to
// `(item_id, warehouse_id)` on POST. Composite PK `(adjustment_id, item_id, warehouse_id)`.
export const stockAdjustmentLine = pgTable(
  "stock_adjustment_line",
  {
    ...tenantColumn,
    adjustmentId: uuid()
      .notNull()
      .references(() => stockAdjustment.id),
    itemId: uuid()
      .notNull()
      .references(() => item.id),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouse.id),
    deltaQty: qty().notNull(),
  },
  (t) => [tenantFk(t), primaryKey({ columns: [t.adjustmentId, t.itemId, t.warehouseId] })],
);
