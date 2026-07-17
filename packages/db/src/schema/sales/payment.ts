import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { money } from "../../base-columns.js";
import type { PaymentMethod, ReceiptType } from "../enums.js";
import { invoice } from "./invoice.js";

// Payment recorded against an invoice (spec §5.2). Updates `invoice.amount_paid` and its
// status (design D7); `promptpay_ref` is set only for `PROMPTPAY` payments.
export const payment = pgTable("payment", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  invoiceId: uuid()
    .notNull()
    .references(() => invoice.id),
  method: text().$type<PaymentMethod>().notNull(),
  amount: money().notNull(),
  promptpayRef: text(),
  paidAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Receipt / tax-invoice issued on (first) payment (spec §5.2, design D7) — a plain `RECEIPT`
// for a NON_VAT invoice, a `TAX_INVOICE`/`RECEIPT_TAX_INVOICE` otherwise. `doc_no` is
// auto-issued from the separate `RECEIPT` sequence and unique.
export const receiptTaxInvoice = pgTable("receipt_tax_invoice", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  invoiceId: uuid()
    .notNull()
    .references(() => invoice.id),
  docNo: text().notNull().unique(),
  type: text().$type<ReceiptType>().notNull(),
  paidAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Withholding-tax certificate issued alongside a payment when the invoice carries a
// `wht_rate` (spec §5.2, design D3). `cert_no` is unique; rendered as an async export job.
export const whtCertificate = pgTable("wht_certificate", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  invoiceId: uuid()
    .notNull()
    .references(() => invoice.id),
  certNo: text().notNull().unique(),
  amount: money().notNull(),
  issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
