import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { moneyString, qtyString } from "../money/index.js";
import {
  AllocMethod,
  CostingMethod,
  GoodsIssueStatus,
  GoodsReceiptStatus,
  IssuePurpose,
  ItemType,
  MovementDirection,
  MovementRefType,
  StockAdjustmentStatus,
  StockCountStatus,
} from "../enums/index.js";
import {
  API_PREFIX,
  jobAccepted,
  paginated,
  paginationQuery,
  uuid,
  withErrors,
} from "./_shared.js";

/**
 * M3 — Inventory & Costing contract (spec §3, plan `docs/plans/M3-inventory.md` §1). Router
 * `inventoryContract` covers the item catalog (items · SKUs · UOM conversions · barcode
 * labels), goods receipts (landed-cost) and goods issues, BOMs and cost roll-up, stock
 * counts and reason-gated adjustments, and the operational reports. Money and quantity cross
 * the wire as decimal **strings** (`moneyString`/`qtyString`), never floats. Every endpoint
 * authorizes in-handler via `assertPermissions(user, "inventory...")` (see M0 ts-rest note).
 */

const c = initContract();

// ── Enum schemas ──────────────────────────────────────────────────────────────

export const itemType = z.nativeEnum(ItemType);
export const costingMethod = z.nativeEnum(CostingMethod);
export const allocMethod = z.nativeEnum(AllocMethod);
export const issuePurpose = z.nativeEnum(IssuePurpose);
export const movementDirection = z.nativeEnum(MovementDirection);
export const movementRefType = z.nativeEnum(MovementRefType);
export const goodsReceiptStatus = z.nativeEnum(GoodsReceiptStatus);
export const goodsIssueStatus = z.nativeEnum(GoodsIssueStatus);
export const stockCountStatus = z.nativeEnum(StockCountStatus);
export const stockAdjustmentStatus = z.nativeEnum(StockAdjustmentStatus);

// ── Item catalog ──────────────────────────────────────────────────────────────

/** An item master row — `code` is auto-issued (`AA00001`) by the API on create. */
export const Item = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  item_type: itemType,
  base_uom_id: uuid,
  costing_method: costingMethod,
  standard_cost: moneyString.nullable(),
  min_stock: qtyString.nullable(),
  attributes: z.record(z.unknown()),
  version: z.number().int().nonnegative(),
});
export type Item = z.infer<typeof Item>;

/** `costing_method` defaults to `MAV` server-side when omitted. */
export const CreateItemRequest = z.object({
  name: z.string().min(1),
  item_type: itemType,
  base_uom_id: uuid,
  costing_method: costingMethod.optional(),
  standard_cost: moneyString.optional(),
  min_stock: qtyString.optional(),
  attributes: z.record(z.unknown()).default({}),
});
export type CreateItemRequest = z.infer<typeof CreateItemRequest>;

/** Items list query — cursor pagination plus the optional `filter[item_type]` facet. */
export const ItemsQuery = paginationQuery.extend({
  "filter[item_type]": itemType.optional(),
});
export type ItemsQuery = z.infer<typeof ItemsQuery>;

/** A SKU variant of an item — `sku_code` is auto-issued; `barcode` is unique when set. */
export const Sku = z.object({
  id: uuid,
  item_id: uuid,
  sku_code: z.string(),
  variant: z.string(),
  barcode: z.string().nullable(),
});
export type Sku = z.infer<typeof Sku>;

export const CreateSkuRequest = z.object({
  variant: z.string().min(1),
  barcode: z.string().min(1).optional(),
});
export type CreateSkuRequest = z.infer<typeof CreateSkuRequest>;

/** A conversion factor for one item — `1 from_uom = factor × to_uom`. */
export const UomConversion = z.object({
  id: uuid,
  item_id: uuid,
  from_uom: uuid,
  to_uom: uuid,
  factor: qtyString,
});
export type UomConversion = z.infer<typeof UomConversion>;

export const CreateUomConversionRequest = z.object({
  item_id: uuid,
  from_uom: uuid,
  to_uom: uuid,
  factor: qtyString,
});
export type CreateUomConversionRequest = z.infer<typeof CreateUomConversionRequest>;

/** Barcode-label print request — at least one of `sku_ids` / `lot_ids`. */
export const BarcodePrintRequest = z
  .object({
    sku_ids: z.array(uuid).optional(),
    lot_ids: z.array(uuid).optional(),
  })
  .refine((v) => (v.sku_ids?.length ?? 0) + (v.lot_ids?.length ?? 0) > 0, {
    message: "Provide at least one sku_id or lot_id",
  });
export type BarcodePrintRequest = z.infer<typeof BarcodePrintRequest>;

// ── Goods receipts ────────────────────────────────────────────────────────────

/** A receipt line as submitted — `unit_weight` feeds `WEIGHT` landed-cost allocation. */
export const GoodsReceiptLineInput = z.object({
  item_id: uuid,
  uom_id: uuid,
  qty: qtyString,
  unit_price: moneyString,
  unit_weight: qtyString.optional(),
});
export type GoodsReceiptLineInput = z.infer<typeof GoodsReceiptLineInput>;

/** A receipt line as stored — `allocated_landed`/`unit_cost` are filled at confirm. */
export const GoodsReceiptLine = z.object({
  id: uuid,
  item_id: uuid,
  uom_id: uuid,
  qty: qtyString,
  unit_price: moneyString,
  unit_weight: qtyString.nullable(),
  allocated_landed: moneyString,
  unit_cost: moneyString,
});
export type GoodsReceiptLine = z.infer<typeof GoodsReceiptLine>;

export const GoodsReceipt = z.object({
  id: uuid,
  code: z.string(),
  supplier_id: uuid,
  status: goodsReceiptStatus,
  landed_cost_total: moneyString.nullable(),
  alloc_method: allocMethod.nullable(),
  lines: z.array(GoodsReceiptLine),
  version: z.number().int().nonnegative(),
});
export type GoodsReceipt = z.infer<typeof GoodsReceipt>;

export const CreateGoodsReceiptRequest = z.object({
  supplier_id: uuid,
  lines: z.array(GoodsReceiptLineInput).min(1),
  landed_cost_total: moneyString.optional(),
  alloc_method: allocMethod.optional(),
});
export type CreateGoodsReceiptRequest = z.infer<typeof CreateGoodsReceiptRequest>;

// ── Goods issues ──────────────────────────────────────────────────────────────

export const GoodsIssueLineInput = z.object({
  item_id: uuid,
  uom_id: uuid,
  qty: qtyString,
});
export type GoodsIssueLineInput = z.infer<typeof GoodsIssueLineInput>;

/** An issue line as stored — `unit_cost` is set at post per the item's costing method. */
export const GoodsIssueLine = z.object({
  id: uuid,
  item_id: uuid,
  uom_id: uuid,
  qty: qtyString,
  unit_cost: moneyString,
});
export type GoodsIssueLine = z.infer<typeof GoodsIssueLine>;

export const GoodsIssue = z.object({
  id: uuid,
  code: z.string(),
  purpose: issuePurpose,
  ref_wo_id: uuid.nullable(),
  status: goodsIssueStatus,
  lines: z.array(GoodsIssueLine),
  version: z.number().int().nonnegative(),
});
export type GoodsIssue = z.infer<typeof GoodsIssue>;

export const CreateGoodsIssueRequest = z.object({
  purpose: issuePurpose,
  ref_wo_id: uuid.optional(),
  lines: z.array(GoodsIssueLineInput).min(1),
});
export type CreateGoodsIssueRequest = z.infer<typeof CreateGoodsIssueRequest>;

// ── Bills of materials ────────────────────────────────────────────────────────

/** A BOM component line — `scrap_pct` is a fraction (e.g. "0.05" for 5%). */
export const BomLineInput = z.object({
  item_id: uuid,
  uom_id: uuid,
  qty: qtyString,
  scrap_pct: qtyString.default("0"),
});
export type BomLineInput = z.infer<typeof BomLineInput>;

export const BomLine = z.object({
  id: uuid,
  item_id: uuid,
  uom_id: uuid,
  qty: qtyString,
  scrap_pct: qtyString,
});
export type BomLine = z.infer<typeof BomLine>;

export const Bom = z.object({
  id: uuid,
  finished_item_id: uuid,
  version: z.number().int().positive(),
  is_active: z.boolean(),
  conversion_cost: moneyString.nullable(),
  lines: z.array(BomLine),
});
export type Bom = z.infer<typeof Bom>;

export const CreateBomRequest = z.object({
  finished_item_id: uuid,
  lines: z.array(BomLineInput).min(1),
  conversion_cost: moneyString.optional(),
});
export type CreateBomRequest = z.infer<typeof CreateBomRequest>;

/** One component's contribution to a roll-up (spec §3 / bom spec). */
export const RollupComponent = z.object({
  item_id: uuid,
  qty: qtyString,
  scrap_pct: qtyString,
  unit_cost: moneyString,
  extended_cost: moneyString,
});
export type RollupComponent = z.infer<typeof RollupComponent>;

/** Read-only roll-up result — no ledger rows are written. */
export const RollupResult = z.object({
  bom_id: uuid,
  finished_item_id: uuid,
  conversion_cost: moneyString,
  rolled_up_cost: moneyString,
  components: z.array(RollupComponent),
});
export type RollupResult = z.infer<typeof RollupResult>;

// ── Stock counts ──────────────────────────────────────────────────────────────

/** A count line — `system_qty` snapshot at open; `counted_qty` recorded during COUNTING. */
export const StockCountLine = z.object({
  id: uuid,
  item_id: uuid,
  system_qty: qtyString,
  counted_qty: qtyString.nullable(),
});
export type StockCountLine = z.infer<typeof StockCountLine>;

export const StockCount = z.object({
  id: uuid,
  period: z.string(),
  status: stockCountStatus,
  lines: z.array(StockCountLine),
});
export type StockCount = z.infer<typeof StockCount>;

export const CreateStockCountRequest = z.object({
  period: z.string().min(1),
  item_ids: z.array(uuid).min(1),
});
export type CreateStockCountRequest = z.infer<typeof CreateStockCountRequest>;

/** Record counted quantities against a count's lines. */
export const SetStockCountLinesRequest = z.object({
  lines: z
    .array(z.object({ item_id: uuid, counted_qty: qtyString }))
    .min(1),
});
export type SetStockCountLinesRequest = z.infer<typeof SetStockCountLinesRequest>;

// ── Stock adjustments ─────────────────────────────────────────────────────────

/** An adjustment line — `qty_delta` is the signed change to on-hand in base UOM. */
export const StockAdjustmentLineInput = z.object({
  item_id: uuid,
  warehouse_id: uuid.optional(),
  qty_delta: qtyString,
});
export type StockAdjustmentLineInput = z.infer<typeof StockAdjustmentLineInput>;

export const StockAdjustmentLine = z.object({
  id: uuid,
  item_id: uuid,
  warehouse_id: uuid,
  qty_delta: qtyString,
});
export type StockAdjustmentLine = z.infer<typeof StockAdjustmentLine>;

export const StockAdjustment = z.object({
  id: uuid,
  reason: z.string(),
  status: stockAdjustmentStatus,
  lines: z.array(StockAdjustmentLine),
  version: z.number().int().nonnegative(),
});
export type StockAdjustment = z.infer<typeof StockAdjustment>;

/** `reason` is required and non-blank — a missing/blank reason is a 400 (spec §3.3). */
export const CreateStockAdjustmentRequest = z.object({
  reason: z.string().min(1),
  lines: z.array(StockAdjustmentLineInput).min(1),
});
export type CreateStockAdjustmentRequest = z.infer<typeof CreateStockAdjustmentRequest>;

// ── Reports ───────────────────────────────────────────────────────────────────

export const StockCardQuery = z.object({
  item_id: uuid,
  warehouse_id: uuid.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type StockCardQuery = z.infer<typeof StockCardQuery>;

/** One movement row on a stock card. */
export const StockCardMovement = z.object({
  id: uuid,
  at: z.string().datetime(),
  direction: movementDirection,
  qty: qtyString,
  unit_cost: moneyString,
  ref_type: movementRefType,
  ref_id: uuid.nullable(),
});
export type StockCardMovement = z.infer<typeof StockCardMovement>;

export const StockCardReport = z.object({
  item_id: uuid,
  warehouse_id: uuid.nullable(),
  opening_qty: qtyString,
  opening_value: moneyString,
  movements: z.array(StockCardMovement),
  closing_qty: qtyString,
  closing_value: moneyString,
});
export type StockCardReport = z.infer<typeof StockCardReport>;

export const ValuationQuery = z.object({
  as_of: z.string().datetime().optional(),
});
export type ValuationQuery = z.infer<typeof ValuationQuery>;

/** One item's on-hand valuation — `value = qty_on_hand × avg_cost`. */
export const ValuationLine = z.object({
  item_id: uuid,
  warehouse_id: uuid.nullable(),
  qty_on_hand: qtyString,
  avg_cost: moneyString,
  value: moneyString,
});
export type ValuationLine = z.infer<typeof ValuationLine>;

export const ValuationReport = z.object({
  as_of: z.string().datetime().nullable(),
  lines: z.array(ValuationLine),
  total_value: moneyString,
});
export type ValuationReport = z.infer<typeof ValuationReport>;

/** A low-stock row — on-hand has dropped at/below `min_stock`. */
export const LowStockRow = z.object({
  item_id: uuid,
  warehouse_id: uuid.nullable(),
  on_hand: qtyString,
  min_stock: qtyString,
});
export type LowStockRow = z.infer<typeof LowStockRow>;

export const DeadStockQuery = z.object({
  months: z.coerce.number().int().min(1).default(6),
});
export type DeadStockQuery = z.infer<typeof DeadStockQuery>;

/** A dead-stock row — no movement within the requested window. */
export const DeadStockRow = z.object({
  item_id: uuid,
  warehouse_id: uuid.nullable(),
  qty_on_hand: qtyString,
  last_movement_at: z.string().datetime().nullable(),
});
export type DeadStockRow = z.infer<typeof DeadStockRow>;

// ── Router ────────────────────────────────────────────────────────────────────

export const inventoryContract = c.router(
  {
    // Item catalog (inventory.product.create)
    listItems: {
      method: "GET",
      path: "/items",
      query: ItemsQuery,
      responses: withErrors({ 200: paginated(Item) }),
      summary: "List items (paginated, optional item_type filter)",
    },
    createItem: {
      method: "POST",
      path: "/items",
      body: CreateItemRequest,
      responses: withErrors({ 201: z.object({ item: Item }) }),
      summary: "Create an item (auto-issues a padded code)",
    },
    createSku: {
      method: "POST",
      path: "/items/:id/skus",
      pathParams: z.object({ id: uuid }),
      body: CreateSkuRequest,
      responses: withErrors({ 201: z.object({ sku: Sku }) }),
      summary: "Create a SKU for an item (409 on duplicate barcode)",
    },
    createUomConversion: {
      method: "POST",
      path: "/uom-conversions",
      body: CreateUomConversionRequest,
      responses: withErrors({ 201: z.object({ conversion: UomConversion }) }),
      summary: "Register a UOM conversion factor for an item",
    },
    printBarcodes: {
      method: "POST",
      path: "/barcodes/print",
      body: BarcodePrintRequest,
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue a barcode-label PDF job for SKUs/lots",
    },

    // Goods receipts (inventory.receipt.manage)
    listGoodsReceipts: {
      method: "GET",
      path: "/goods-receipts",
      query: paginationQuery,
      responses: withErrors({ 200: paginated(GoodsReceipt) }),
      summary: "List goods receipts (paginated)",
    },
    createGoodsReceipt: {
      method: "POST",
      path: "/goods-receipts",
      body: CreateGoodsReceiptRequest,
      responses: withErrors({ 201: z.object({ receipt: GoodsReceipt }) }),
      summary: "Create a DRAFT goods receipt",
    },
    confirmGoodsReceipt: {
      method: "POST",
      path: "/goods-receipts/:id/confirm",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ receipt: GoodsReceipt }) }),
      summary: "Confirm a receipt (allocates landed cost)",
    },
    postGoodsReceipt: {
      method: "POST",
      path: "/goods-receipts/:id/post",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ receipt: GoodsReceipt }) }),
      summary: "Post a receipt (creates lots + IN movements; 409 if already posted)",
    },

    // Goods issues (inventory.issue.manage)
    listGoodsIssues: {
      method: "GET",
      path: "/goods-issues",
      query: paginationQuery,
      responses: withErrors({ 200: paginated(GoodsIssue) }),
      summary: "List goods issues (paginated)",
    },
    createGoodsIssue: {
      method: "POST",
      path: "/goods-issues",
      body: CreateGoodsIssueRequest,
      responses: withErrors({ 201: z.object({ issue: GoodsIssue }) }),
      summary: "Create a DRAFT goods issue",
    },
    postGoodsIssue: {
      method: "POST",
      path: "/goods-issues/:id/post",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ issue: GoodsIssue }) }),
      summary: "Post an issue (OUT movements; 422 on insufficient stock)",
    },

    // Bills of materials (inventory.product.create)
    createBom: {
      method: "POST",
      path: "/boms",
      body: CreateBomRequest,
      responses: withErrors({ 201: z.object({ bom: Bom }) }),
      summary: "Create a versioned BOM for a finished item",
    },
    rollupBom: {
      method: "POST",
      path: "/boms/:id/rollup",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: RollupResult }),
      summary: "Compute a read-only rolled-up cost (writes no ledger rows)",
    },

    // Stock counts (inventory.issue.manage)
    createStockCount: {
      method: "POST",
      path: "/stock-counts",
      body: CreateStockCountRequest,
      responses: withErrors({ 201: z.object({ count: StockCount }) }),
      summary: "Open a stock count (snapshots system_qty per item)",
    },
    setStockCountLines: {
      method: "PUT",
      path: "/stock-counts/:id/lines",
      pathParams: z.object({ id: uuid }),
      body: SetStockCountLinesRequest,
      responses: withErrors({ 200: z.object({ count: StockCount }) }),
      summary: "Record counted quantities against a count's lines",
    },
    reconcileStockCount: {
      method: "POST",
      path: "/stock-counts/:id/reconcile",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ adjustment: StockAdjustment }) }),
      summary: "Reconcile a count into a draft adjustment for the differences",
    },

    // Stock adjustments (inventory.adjustment.approve to approve)
    createStockAdjustment: {
      method: "POST",
      path: "/stock-adjustments",
      body: CreateStockAdjustmentRequest,
      responses: withErrors({ 201: z.object({ adjustment: StockAdjustment }) }),
      summary: "Create a DRAFT adjustment (400 if reason is missing/blank)",
    },
    approveStockAdjustment: {
      method: "POST",
      path: "/stock-adjustments/:id/approve",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ adjustment: StockAdjustment }) }),
      summary: "Approve an adjustment (inventory.adjustment.approve)",
    },
    postStockAdjustment: {
      method: "POST",
      path: "/stock-adjustments/:id/post",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ adjustment: StockAdjustment }) }),
      summary: "Post an adjustment (ADJUST movements + one audit row)",
    },

    // Reports (valuation/cost columns require inventory.cost.view)
    stockCardReport: {
      method: "GET",
      path: "/reports/stock-card",
      query: StockCardQuery,
      responses: withErrors({ 200: StockCardReport }),
      summary: "Stock card — opening, movements, closing over a date range",
    },
    valuationReport: {
      method: "GET",
      path: "/reports/valuation",
      query: ValuationQuery,
      responses: withErrors({ 200: ValuationReport }),
      summary: "On-hand valuation (requires inventory.cost.view)",
    },
    lowStockReport: {
      method: "GET",
      path: "/reports/low-stock",
      responses: withErrors({ 200: z.object({ rows: z.array(LowStockRow) }) }),
      summary: "Items at or below their minimum stock",
    },
    deadStockReport: {
      method: "GET",
      path: "/reports/dead-stock",
      query: DeadStockQuery,
      responses: withErrors({ 200: z.object({ rows: z.array(DeadStockRow) }) }),
      summary: "Items with no movement within the requested window",
    },
  },
  { pathPrefix: API_PREFIX },
);
