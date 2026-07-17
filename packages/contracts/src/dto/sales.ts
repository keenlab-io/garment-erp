import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { moneyString, qtyString, rateString } from "../money/index.js";
import {
  DocType,
  InvoiceStatus,
  PaymentMethod,
  QuotationStatus,
  ReceiptType,
  VatApplicability,
  VatMode,
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
 * M5 — Sales Documents contract (spec §5, plan `docs/plans/M5-sales.md` §1). Router
 * `salesContract` covers the customer master, the Quotation → Invoice → Receipt/Tax-Invoice
 * lifecycle (with 1-click convert and partial billing), VAT (include/exclude) & WHT
 * computation, PromptPay QR, PDF/Excel/JPG document export, credit-terms aging, the overdue
 * sweep, and a non-authoritative e-Tax submission stub. Money/quantity/rate cross the wire as
 * decimal **strings** (`moneyString`/`qtyString`/`rateString`), never floats — all totals are
 * server-computed from `lines`; client-sent totals are ignored (spec §5.5). Every endpoint
 * authorizes in-handler via `assertPermissions(user, "sales...")` (see M0 ts-rest note).
 */

const c = initContract();

// ── Enum schemas ──────────────────────────────────────────────────────────────

export const vatApplicability = z.nativeEnum(VatApplicability);
export const vatCalc = z.nativeEnum(VatMode); // VatNai (include) | VatNok (exclude)
export const quotationMode = z.nativeEnum(DocType); // QV | QNV numbering mode
export const quotationStatus = z.nativeEnum(QuotationStatus);
export const invoiceStatus = z.nativeEnum(InvoiceStatus);
export const receiptType = z.nativeEnum(ReceiptType);
export const paymentMethod = z.nativeEnum(PaymentMethod);

// ── Customers ─────────────────────────────────────────────────────────────────

export const CustomerAddress = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  subdistrict: z.string().optional(),
  district: z.string().optional(),
  province: z.string().optional(),
  postal_code: z.string().optional(),
  is_default: z.boolean().default(false),
});
export type CustomerAddress = z.infer<typeof CustomerAddress>;

export const Customer = z.object({
  id: uuid,
  name: z.string(),
  tax_id: z.string().nullable(),
  branch_code: z.string().nullable(),
  addresses: z.array(CustomerAddress),
  credit_terms_days: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});
export type Customer = z.infer<typeof Customer>;

export const CreateCustomerRequest = z.object({
  name: z.string().min(1),
  tax_id: z.string().optional(),
  branch_code: z.string().optional(),
  addresses: z.array(CustomerAddress).default([]),
  credit_terms_days: z.number().int().nonnegative().default(0),
});
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequest>;

/** `search` matches name/tax_id — used to autocomplete-fill address + branch on the client. */
export const CustomersQuery = paginationQuery.extend({
  search: z.string().optional(),
});
export type CustomersQuery = z.infer<typeof CustomersQuery>;

// ── Document lines (shared by quotations & invoices) ─────────────────────────

export const DocLineInput = z.object({
  item_id: uuid.optional(),
  description: z.string().min(1),
  qty: qtyString,
  unit_price: moneyString,
  discount: moneyString.optional(),
});
export type DocLineInput = z.infer<typeof DocLineInput>;

/** A materialized document line — `line_total` is server-computed from qty/unit_price/discount. */
export const DocLine = z.object({
  id: uuid,
  item_id: uuid.nullable(),
  description: z.string(),
  qty: qtyString,
  unit_price: moneyString,
  discount: moneyString,
  line_total: moneyString,
});
export type DocLine = z.infer<typeof DocLine>;

// ── Quotations ────────────────────────────────────────────────────────────────

export const Quotation = z.object({
  id: uuid,
  doc_no: z.string(),
  customer_id: uuid,
  vat_mode: vatApplicability,
  vat_calc: vatCalc,
  valid_until: z.string().nullable(), // ISO date (YYYY-MM-DD)
  status: quotationStatus,
  lines: z.array(DocLine),
  subtotal: moneyString,
  vat_amount: moneyString,
  grand_total: moneyString,
  version: z.number().int().nonnegative(),
});
export type Quotation = z.infer<typeof Quotation>;

/** `doc_no` is auto-issued — QV (VAT) / QNV (non-VAT) — from `vat_mode`. */
export const CreateQuotationRequest = z.object({
  customer_id: uuid,
  vat_mode: vatApplicability,
  vat_calc: vatCalc,
  valid_until: z.string().optional(), // ISO date (YYYY-MM-DD)
  lines: z.array(DocLineInput).min(1),
});
export type CreateQuotationRequest = z.infer<typeof CreateQuotationRequest>;

// ── Invoices ──────────────────────────────────────────────────────────────────

export const Invoice = z.object({
  id: uuid,
  doc_no: z.string(),
  quotation_id: uuid.nullable(),
  customer_id: uuid,
  issue_date: z.string(), // ISO date (YYYY-MM-DD)
  due_date: z.string().nullable(), // ISO date (YYYY-MM-DD)
  wht_rate: rateString.nullable(),
  status: invoiceStatus,
  lines: z.array(DocLine),
  subtotal: moneyString,
  vat_amount: moneyString,
  wht_amount: moneyString,
  grand_total: moneyString,
  amount_paid: moneyString,
  version: z.number().int().nonnegative(),
});
export type Invoice = z.infer<typeof Invoice>;

/** `from_quotation_id` links a partial-billing invoice to its quotation (spec §5.5 — Σ invoice
 * subtotals for that quotation must stay ≤ the quotation subtotal, 422 on exceed). */
export const CreateInvoiceRequest = z.object({
  customer_id: uuid,
  from_quotation_id: uuid.optional(),
  due_date: z.string().optional(), // ISO date (YYYY-MM-DD)
  credit_terms_days: z.number().int().nonnegative().optional(),
  wht_rate: rateString.optional(),
  lines: z.array(DocLineInput).min(1),
});
export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequest>;

export const RecordPaymentRequest = z.object({
  amount: moneyString,
  method: paymentMethod,
  promptpay_ref: z.string().optional(),
});
export type RecordPaymentRequest = z.infer<typeof RecordPaymentRequest>;

export const Payment = z.object({
  id: uuid,
  invoice_id: uuid,
  amount: moneyString,
  method: paymentMethod,
  promptpay_ref: z.string().nullable(),
  paid_at: z.string().datetime(),
});
export type Payment = z.infer<typeof Payment>;

/** Issued on (first) payment — a plain RECEIPT for a NON_VAT invoice, a tax invoice otherwise. */
export const ReceiptTaxInvoice = z.object({
  id: uuid,
  doc_no: z.string(),
  invoice_id: uuid,
  type: receiptType,
  paid_at: z.string().datetime(),
});
export type ReceiptTaxInvoice = z.infer<typeof ReceiptTaxInvoice>;

/** `reason` is required and non-blank — a missing/blank reason is a 400 (spec §5.5). */
export const VoidDocumentRequest = z.object({
  reason: z.string().min(1),
});
export type VoidDocumentRequest = z.infer<typeof VoidDocumentRequest>;

export const PromptPayQr = z.object({
  payload: z.string(),
  png_base64: z.string(),
});
export type PromptPayQr = z.infer<typeof PromptPayQr>;

export const ExportFormat = z.enum(["pdf", "excel", "jpg"]);
export type ExportFormat = z.infer<typeof ExportFormat>;

export const ExportInvoiceQuery = z.object({
  format: ExportFormat,
});
export type ExportInvoiceQuery = z.infer<typeof ExportInvoiceQuery>;

// ── Reports ───────────────────────────────────────────────────────────────────

export const AgingReportQuery = z.object({
  as_of: z.string().datetime().optional(),
});
export type AgingReportQuery = z.infer<typeof AgingReportQuery>;

/** One customer's aging row — credit-terms bucketed outstanding balance. */
export const AgingReportRow = z.object({
  customer_id: uuid,
  customer_name: z.string(),
  current: moneyString,
  d1_30: moneyString,
  d31_60: moneyString,
  d61_90: moneyString,
  over_90: moneyString,
});
export type AgingReportRow = z.infer<typeof AgingReportRow>;

// ── Router ────────────────────────────────────────────────────────────────────

export const salesContract = c.router(
  {
    // Customers (sales.customer.manage)
    createCustomer: {
      method: "POST",
      path: "/customers",
      body: CreateCustomerRequest,
      responses: withErrors({ 201: z.object({ customer: Customer }) }),
      summary: "Create a customer",
    },
    listCustomers: {
      method: "GET",
      path: "/customers",
      query: CustomersQuery,
      responses: withErrors({ 200: paginated(Customer) }),
      summary: "List/autocomplete customers by name or tax_id",
    },

    // Quotations (sales.quotation.manage)
    createQuotation: {
      method: "POST",
      path: "/quotations",
      body: CreateQuotationRequest,
      responses: withErrors({ 201: z.object({ quotation: Quotation }) }),
      summary: "Create a DRAFT quotation (doc_no auto-issued QV/QNV by vat_mode)",
    },
    sendQuotation: {
      method: "POST",
      path: "/quotations/:id/send",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ quotation: Quotation }) }),
      summary: "Send a DRAFT quotation to the customer",
    },
    approveQuotation: {
      method: "POST",
      path: "/quotations/:id/approve",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ quotation: Quotation }) }),
      summary: "Approve a sent quotation (emits QuotationApproved)",
    },
    rejectQuotation: {
      method: "POST",
      path: "/quotations/:id/reject",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ quotation: Quotation }) }),
      summary: "Reject a sent quotation",
    },
    convertQuotation: {
      method: "POST",
      path: "/quotations/:id/convert",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 201: z.object({ invoice: Invoice }) }),
      summary:
        "Convert an APPROVED quotation to an invoice (sales.invoice.create; copies lines/" +
        "prices, quotation -> CONVERTED atomically; re-convert -> 409)",
    },

    // Invoices (sales.invoice.create)
    createInvoice: {
      method: "POST",
      path: "/invoices",
      body: CreateInvoiceRequest,
      responses: withErrors({ 201: z.object({ invoice: Invoice }) }),
      summary: "Create a DRAFT invoice (optionally linked to a quotation for partial billing)",
    },
    issueInvoice: {
      method: "POST",
      path: "/invoices/:id/issue",
      pathParams: z.object({ id: uuid }),
      body: z.void(),
      responses: withErrors({ 200: z.object({ invoice: Invoice }) }),
      summary: "Issue an invoice (ISSUED; optional stock OUT once M3 is applied)",
    },
    recordPayment: {
      method: "POST",
      path: "/invoices/:id/payments",
      pathParams: z.object({ id: uuid }),
      body: RecordPaymentRequest,
      responses: withErrors({
        201: z.object({ payment: Payment, receipt: ReceiptTaxInvoice.nullable() }),
      }),
      summary:
        "Record a payment (sales.payment.record; sets PAID/PARTIALLY_PAID; issues the " +
        "receipt/tax-invoice on first payment)",
    },
    voidInvoice: {
      method: "POST",
      path: "/invoices/:id/void",
      pathParams: z.object({ id: uuid }),
      body: VoidDocumentRequest,
      responses: withErrors({ 200: z.object({ invoice: Invoice }) }),
      summary:
        "Void an invoice (sales.document.void; never deletes; 409 if a receipt/tax-invoice " +
        "already exists)",
    },
    getInvoicePromptPayQr: {
      method: "GET",
      path: "/invoices/:id/promptpay-qr",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: PromptPayQr }),
      summary: "Get the EMVCo PromptPay QR payload + PNG for an invoice",
    },
    exportInvoice: {
      method: "GET",
      path: "/invoices/:id/export",
      pathParams: z.object({ id: uuid }),
      query: ExportInvoiceQuery,
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue an invoice export job (pdf | excel | jpg)",
    },
    getInvoiceWhtCertificate: {
      method: "GET",
      path: "/invoices/:id/wht-certificate",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue a WHT certificate export job",
    },

    // Reports
    agingReport: {
      method: "GET",
      path: "/reports/aging",
      query: AgingReportQuery,
      responses: withErrors({ 200: z.object({ rows: z.array(AgingReportRow) }) }),
      summary: "Credit-terms aging report — outstanding balance bucketed by days overdue",
    },

    // e-Tax (sales.etax.submit)
    submitEtax: {
      method: "POST",
      path: "/etax/:invoice_id/submit",
      pathParams: z.object({ invoice_id: uuid }),
      body: z.void(),
      responses: withErrors({ 202: jobAccepted }),
      summary: "Enqueue a non-authoritative RD e-Tax XML submission for an invoice",
    },
  },
  { pathPrefix: API_PREFIX },
);
