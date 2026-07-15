// M3 — Inventory & Costing enums (spec §3.3). Item/costing classifications, the stock-ledger
// movement descriptors, landed-cost allocation, issue purpose, and the goods-receipt /
// goods-issue / stock-count / stock-adjustment state machines. Keep in sync with
// @erp/db/schema/enums.ts (parity is asserted by test).

// Item classification (spec §3.2). RAW consumes into production, FINISHED is produced,
// CONSUMABLE is indirect (never a BOM output).
export const ItemType = {
  RAW: "RAW",
  FINISHED: "FINISHED",
  CONSUMABLE: "CONSUMABLE",
} as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

// Costing method per item (spec §3.4). MAV (moving average) is the default; FIFO consumes
// lots oldest-first; STANDARD posts at the item's standard cost with variance captured.
export const CostingMethod = {
  MAV: "MAV",
  FIFO: "FIFO",
  STANDARD: "STANDARD",
} as const;
export type CostingMethod = (typeof CostingMethod)[keyof typeof CostingMethod];

// Signed direction of a stock_movement row (spec §3.5). IN adds, OUT removes, ADJUST is a
// count/correction delta (its own sign carried on `qty`).
export const MovementDirection = {
  IN: "IN",
  OUT: "OUT",
  ADJUST: "ADJUST",
} as const;
export type MovementDirection = (typeof MovementDirection)[keyof typeof MovementDirection];

// Source document a movement references (`ref_type`/`ref_id`). Lets the stock card trace
// every ledger row back to the receipt/issue/adjustment/count/backflush that produced it.
export const MovementRefType = {
  GOODS_RECEIPT: "GOODS_RECEIPT",
  GOODS_ISSUE: "GOODS_ISSUE",
  BACKFLUSH: "BACKFLUSH",
  ADJUSTMENT: "ADJUSTMENT",
  COUNT: "COUNT",
} as const;
export type MovementRefType = (typeof MovementRefType)[keyof typeof MovementRefType];

// Landed-cost allocation basis at receipt confirm (spec §3.4 / design D6). VALUE by line
// extended price, WEIGHT by qty×unit weight, QTY by quantity.
export const AllocMethod = {
  VALUE: "VALUE",
  WEIGHT: "WEIGHT",
  QTY: "QTY",
} as const;
export type AllocMethod = (typeof AllocMethod)[keyof typeof AllocMethod];

// Why stock is being issued (goods_issue `purpose`). PRODUCTION feeds a work order,
// SALE fulfils a sales document, OTHER covers scrap/samples/misc.
export const IssuePurpose = {
  PRODUCTION: "PRODUCTION",
  SALE: "SALE",
  OTHER: "OTHER",
} as const;
export type IssuePurpose = (typeof IssuePurpose)[keyof typeof IssuePurpose];

// Goods-receipt lifecycle (spec §3.3): DRAFT → CONFIRMED (landed-cost alloc) → POSTED (ledger IN).
export const GoodsReceiptStatus = {
  DRAFT: "DRAFT",
  CONFIRMED: "CONFIRMED",
  POSTED: "POSTED",
} as const;
export type GoodsReceiptStatus = (typeof GoodsReceiptStatus)[keyof typeof GoodsReceiptStatus];

// Goods-issue lifecycle (spec §3.3): DRAFT → POSTED (ledger OUT).
export const GoodsIssueStatus = {
  DRAFT: "DRAFT",
  POSTED: "POSTED",
} as const;
export type GoodsIssueStatus = (typeof GoodsIssueStatus)[keyof typeof GoodsIssueStatus];

// Stock-count lifecycle (spec §3.3): OPEN → COUNTING (lock item movement) → RECONCILED →
// ADJUSTED → CLOSED.
export const StockCountStatus = {
  OPEN: "OPEN",
  COUNTING: "COUNTING",
  RECONCILED: "RECONCILED",
  ADJUSTED: "ADJUSTED",
  CLOSED: "CLOSED",
} as const;
export type StockCountStatus = (typeof StockCountStatus)[keyof typeof StockCountStatus];

// Stock-adjustment lifecycle (spec §3.3): DRAFT → APPROVED → POSTED (ledger ADJUST).
export const StockAdjustmentStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
} as const;
export type StockAdjustmentStatus =
  (typeof StockAdjustmentStatus)[keyof typeof StockAdjustmentStatus];
