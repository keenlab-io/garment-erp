// M5 — Sales Documents enums (spec §5.3, plan `docs/plans/M5-sales.md` §1). Only the *new*
// dimensions are defined here — `vat_calc` reuses the existing `VatMode` (VatNai|VatNok,
// doc-type.ts) and the quotation numbering mode reuses `DocType` (QV|QNV). Keep in sync with
// @erp/db/schema/enums.ts (parity is asserted by test).

// Whether a document is subject to VAT at all (spec §5.2 quotation/invoice `vat_mode`) —
// distinct from `vat_calc`'s include/exclude dimension (the reused `VatMode` enum).
export const VatApplicability = {
  VAT: "VAT",
  NON_VAT: "NON_VAT",
} as const;
export type VatApplicability = (typeof VatApplicability)[keyof typeof VatApplicability];

// Quotation lifecycle (spec §5.3): DRAFT -> SENT -> APPROVED -> CONVERTED, with EXPIRED (past
// valid_until) | REJECTED | VOID side branches. No backward transitions.
export const QuotationStatus = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  APPROVED: "APPROVED",
  CONVERTED: "CONVERTED",
  EXPIRED: "EXPIRED",
  REJECTED: "REJECTED",
  VOID: "VOID",
} as const;
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

// Invoice lifecycle (spec §5.3): DRAFT -> ISSUED -> PARTIALLY_PAID -> PAID, with OVERDUE (past
// due_date & not PAID) | VOID side branches.
export const InvoiceStatus = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  VOID: "VOID",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

// Receipt/tax-invoice document type (spec §5.2 `receipt_tax_invoice.type`). A plain RECEIPT
// is the only type a NON_VAT invoice may ever issue (spec §5.4).
export const ReceiptType = {
  RECEIPT: "RECEIPT",
  TAX_INVOICE: "TAX_INVOICE",
  RECEIPT_TAX_INVOICE: "RECEIPT_TAX_INVOICE",
} as const;
export type ReceiptType = (typeof ReceiptType)[keyof typeof ReceiptType];

// Payment method (spec §5.2 `payment.method`).
export const PaymentMethod = {
  TRANSFER: "TRANSFER",
  PROMPTPAY: "PROMPTPAY",
  CASH: "CASH",
  CHEQUE: "CHEQUE",
  CREDIT_CARD: "CREDIT_CARD",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
