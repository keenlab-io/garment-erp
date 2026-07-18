import type {
  customer,
  docLine,
  invoice,
  payment,
  quotation,
  receiptTaxInvoice,
} from "@erp/db";
import {
  asMoney,
  asQty,
  asRate,
  type Customer as CustomerDto,
  type CustomerAddress,
  type DocLine as DocLineDto,
  type Invoice as InvoiceDto,
  type Payment as PaymentDto,
  type Quotation as QuotationDto,
  type ReceiptTaxInvoice as ReceiptDto,
} from "@erp/contracts";

type CustomerRow = typeof customer.$inferSelect;
type QuotationRow = typeof quotation.$inferSelect;
type InvoiceRow = typeof invoice.$inferSelect;
type DocLineRow = typeof docLine.$inferSelect;
type PaymentRow = typeof payment.$inferSelect;
type ReceiptRow = typeof receiptTaxInvoice.$inferSelect;

/** An ISO calendar date (`YYYY-MM-DD`) for a `date()` column. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add `days` to an ISO calendar date, returning a new `YYYY-MM-DD` string. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** Map a `customer` row to its contract shape (`addresses` is a jsonb array). */
export function toCustomerDto(row: CustomerRow): CustomerDto {
  return {
    id: row.id,
    name: row.name,
    tax_id: row.taxId,
    branch_code: row.branchCode,
    addresses: (row.addresses as CustomerAddress[] | null) ?? [],
    credit_terms_days: row.creditTermsDays,
    version: row.version,
  };
}

/** Map a `doc_line` row to its contract shape (all amounts are pre-formatted strings). */
export function toDocLineDto(row: DocLineRow): DocLineDto {
  return {
    id: row.id,
    item_id: row.itemId,
    description: row.description,
    qty: asQty(row.qty),
    unit_price: asMoney(row.unitPrice),
    discount: asMoney(row.discount),
    line_total: asMoney(row.lineTotal),
  };
}

/** Map a `quotation` row plus its materialized lines to the contract shape. */
export function toQuotationDto(row: QuotationRow, lines: DocLineRow[]): QuotationDto {
  return {
    id: row.id,
    doc_no: row.docNo,
    customer_id: row.customerId,
    vat_mode: row.vatMode,
    vat_calc: row.vatCalc,
    valid_until: row.validUntil,
    status: row.status,
    lines: lines.map(toDocLineDto),
    subtotal: asMoney(row.subtotal),
    vat_amount: asMoney(row.vatAmount),
    grand_total: asMoney(row.grandTotal),
    version: row.version,
  };
}

/** Map an `invoice` row plus its materialized lines to the contract shape. */
export function toInvoiceDto(row: InvoiceRow, lines: DocLineRow[]): InvoiceDto {
  return {
    id: row.id,
    doc_no: row.docNo,
    quotation_id: row.quotationId,
    customer_id: row.customerId,
    issue_date: row.issueDate,
    due_date: row.dueDate,
    wht_rate: row.whtRate === null ? null : asRate(row.whtRate),
    status: row.status,
    lines: lines.map(toDocLineDto),
    subtotal: asMoney(row.subtotal),
    vat_amount: asMoney(row.vatAmount),
    wht_amount: asMoney(row.whtAmount),
    grand_total: asMoney(row.grandTotal),
    amount_paid: asMoney(row.amountPaid),
    version: row.version,
  };
}

/** Map a `payment` row to its contract shape. */
export function toPaymentDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    invoice_id: row.invoiceId,
    amount: asMoney(row.amount),
    method: row.method,
    promptpay_ref: row.promptpayRef,
    paid_at: row.paidAt.toISOString(),
  };
}

/** Map a `receipt_tax_invoice` row to its contract shape. */
export function toReceiptDto(row: ReceiptRow): ReceiptDto {
  return {
    id: row.id,
    doc_no: row.docNo,
    invoice_id: row.invoiceId,
    type: row.type,
    paid_at: row.paidAt.toISOString(),
  };
}
