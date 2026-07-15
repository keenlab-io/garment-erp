/**
 * M3 inventory domain-event names and payload shapes (design D8/D8b). The ledger owns
 * the events it emits (`GoodsReceiptPosted`, `GoodsIssued`, `StockAdjusted`,
 * `LowStockReached`, `BackflushPosted`) and the events it consumes but does not yet have
 * an emitter for (`WorkOrderCompleted` from M4, and M5's sales/void events). The consumer
 * handlers ship dormant and are idempotent on their natural key so a redelivery can never
 * double-post.
 */

// ── Emitted by M3 ─────────────────────────────────────────────────────────────

export const INVENTORY_EVENTS = {
  goodsReceiptPosted: "inventory.goods_receipt.posted",
  goodsIssued: "inventory.goods_issue.posted",
  stockAdjusted: "inventory.stock.adjusted",
  lowStockReached: "inventory.stock.low_stock_reached",
  backflushPosted: "inventory.backflush.posted",
} as const;

// ── Consumed by M3 (emitters land in M4/M5) ───────────────────────────────────

export const WORK_ORDER_COMPLETED = "production.work_order.completed";
export const INVOICE_ISSUED = "sales.invoice.issued";
export const DELIVERY_NOTE_ISSUED = "sales.delivery_note.issued";
export const DOCUMENT_VOIDED = "sales.document.voided";

/** Payload of `WorkOrderCompleted` — the minimum M3's backflush needs (M4 emits it). */
export interface WorkOrderCompletedPayload {
  wo_id: string;
  finished_item_id: string;
  warehouse_id: string;
  qty_produced: string;
}

/** One inventory-linked line on a sales document (M5 emits these). */
export interface SalesStockLine {
  item_id: string;
  warehouse_id: string;
  qty: string;
  uom_id: string;
}

/** Payload of `InvoiceIssued` / `DeliveryNoteIssued` — optional stock OUT per line. */
export interface SalesIssuedPayload {
  document_id: string;
  lines: SalesStockLine[];
}

/** Payload of `DocumentVoided` — compensating IN when the document posted an OUT. */
export interface DocumentVoidedPayload {
  document_id: string;
}
