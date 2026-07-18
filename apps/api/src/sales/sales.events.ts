/**
 * M5 sales domain-event names and payload shapes (design D4b/D7/D11/D12). The module emits the
 * quotation/invoice/payment lifecycle events; three of them cross into M3's inventory ledger —
 * their names and payloads MUST match `inventory.events.ts`
 * (`INVOICE_ISSUED`/`DELIVERY_NOTE_ISSUED`/`DOCUMENT_VOIDED`, `SalesIssuedPayload`/
 * `DocumentVoidedPayload`) so an issued/voided document drives exactly one idempotent stock
 * OUT / compensating IN. The stock-linked emissions stay dormant until M3 registers handlers.
 */

export const SALES_EVENTS = {
  quotationApproved: "sales.quotation.approved",
  // Must equal `inventory.events.ts` INVOICE_ISSUED — the optional stock-OUT trigger.
  invoiceIssued: "sales.invoice.issued",
  // Must equal `inventory.events.ts` DELIVERY_NOTE_ISSUED.
  deliveryNoteIssued: "sales.delivery_note.issued",
  paymentReceived: "sales.payment.received",
  invoiceOverdue: "sales.invoice.overdue",
  // Must equal `inventory.events.ts` DOCUMENT_VOIDED — the compensating-IN trigger.
  documentVoided: "sales.document.voided",
} as const;

/**
 * One inventory-linked line on a sales document — matches `SalesStockLine` in
 * `inventory.events.ts`. `warehouse_id`/`uom_id` are left empty by M5 (a sales line carries no
 * warehouse or UOM); the M3 consumer defaults them to the item's default warehouse / base UOM.
 */
export interface SalesStockLine {
  item_id: string;
  warehouse_id: string;
  qty: string;
  uom_id: string;
}

/** Payload of `InvoiceIssued` / `DeliveryNoteIssued` — matches `SalesIssuedPayload` (M3). */
export interface SalesIssuedPayload {
  document_id: string;
  lines: SalesStockLine[];
}

/** Payload of `DocumentVoided` — matches `DocumentVoidedPayload` (M3). */
export interface DocumentVoidedPayload {
  document_id: string;
}

/** Payload of `QuotationApproved` (M5 → UI/audit). */
export interface QuotationApprovedPayload {
  quotation_id: string;
  doc_no: string;
}

/** Payload of `PaymentReceived` (M5 → UI/audit/notification). */
export interface PaymentReceivedPayload {
  invoice_id: string;
  payment_id: string;
  amount: string;
  fully_paid: boolean;
}

/** Payload of `InvoiceOverdue` (the overdue sweep → notification). */
export interface InvoiceOverduePayload {
  invoice_id: string;
  doc_no: string;
  due_date: string | null;
}
