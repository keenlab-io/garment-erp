import { sql } from "drizzle-orm";
import { date, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { money, rate, versionColumn } from "../../base-columns.js";
import type { InvoiceStatus } from "../enums.js";
import { customer } from "./customer.js";
import { quotation } from "./quotation.js";

// Invoice header (spec §5.2). `doc_no` is auto-issued from the `INVOICE` sequence and unique.
// `quotation_id` is nullable — an invoice may be raised directly or converted/partially billed
// from a quotation (design D5/D6). `wht_rate` is optional; when set, `TotalsService` computes
// `wht_amount` and issues a `wht_certificate` (design D3). Totals + `amount_paid` are
// server-computed and start at 0. Carries the optimistic-concurrency `version` column.
export const invoice = pgTable("invoice", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  docNo: text().notNull().unique(),
  quotationId: uuid().references(() => quotation.id),
  customerId: uuid()
    .notNull()
    .references(() => customer.id),
  issueDate: date().notNull(),
  dueDate: date(),
  whtRate: rate(),
  status: text().$type<InvoiceStatus>().notNull().default("DRAFT"),
  subtotal: money().notNull().default("0"),
  vatAmount: money().notNull().default("0"),
  whtAmount: money().notNull().default("0"),
  grandTotal: money().notNull().default("0"),
  amountPaid: money().notNull().default("0"),
  ...versionColumn,
});
