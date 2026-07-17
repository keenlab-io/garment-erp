import { sql } from "drizzle-orm";
import { date, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { money, versionColumn } from "../../base-columns.js";
import type { QuotationStatus, VatApplicability, VatMode } from "../enums.js";
import { customer } from "./customer.js";

// Quotation header (spec §5.2). `doc_no` is auto-issued — `QV` (VAT) / `QNV` (non-VAT) via
// SequenceService — and unique. `vat_mode` says whether the document is VAT at all;
// `vat_calc` is the reused include/exclude `VatMode`. Totals are server-computed from
// `doc_line` rows (design D2) and start at 0. Carries the optimistic-concurrency `version`
// column (guards convert-once, design D5).
export const quotation = pgTable("quotation", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  docNo: text().notNull().unique(),
  customerId: uuid()
    .notNull()
    .references(() => customer.id),
  vatMode: text().$type<VatApplicability>().notNull(),
  vatCalc: text().$type<VatMode>().notNull(),
  validUntil: date(),
  status: text().$type<QuotationStatus>().notNull().default("DRAFT"),
  subtotal: money().notNull().default("0"),
  vatAmount: money().notNull().default("0"),
  grandTotal: money().notNull().default("0"),
  ...versionColumn,
});
