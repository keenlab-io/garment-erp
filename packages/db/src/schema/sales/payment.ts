import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { money, tenantColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";
import type { PaymentMethod, ReceiptType } from "../enums.js";
import { invoice } from "./invoice.js";

// Payment recorded against an invoice (spec §5.2). Updates `invoice.amount_paid` and its
// status (design D7); `promptpay_ref` is set only for `PROMPTPAY` payments.
export const payment = pgTable(
  "payment",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    invoiceId: uuid()
      .notNull()
      .references(() => invoice.id),
    method: text().$type<PaymentMethod>().notNull(),
    amount: money().notNull(),
    promptpayRef: text(),
    paidAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [tenantFk(t)],
);

// Receipt / tax-invoice issued on (first) payment (spec §5.2, design D7) — a plain `RECEIPT`
// for a NON_VAT invoice, a `TAX_INVOICE`/`RECEIPT_TAX_INVOICE` otherwise. `doc_no` is
// auto-issued from the separate `RECEIPT` sequence and unique.
export const receiptTaxInvoice = pgTable(
  "receipt_tax_invoice",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    invoiceId: uuid()
      .notNull()
      .references(() => invoice.id),
    docNo: text().notNull(),
    type: text().$type<ReceiptType>().notNull(),
    paidAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantFk(t),
    unique("receipt_tax_invoice_tenant_doc_no_uq").on(t.tenantId, t.docNo),
  ],
);

// Withholding-tax certificate issued alongside a payment when the invoice carries a
// `wht_rate` (spec §5.2, design D3). `cert_no` is unique; rendered as an async export job.
export const whtCertificate = pgTable(
  "wht_certificate",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    invoiceId: uuid()
      .notNull()
      .references(() => invoice.id),
    certNo: text().notNull(),
    amount: money().notNull(),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantFk(t),
    unique("wht_certificate_tenant_cert_no_uq").on(t.tenantId, t.certNo),
  ],
);
