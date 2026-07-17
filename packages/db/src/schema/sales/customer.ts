import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { auditColumns, versionColumn } from "../../base-columns.js";

// Customer master (spec §5.2) — the billing party referenced by quotations and invoices.
// `addresses` is a jsonb array of `{ line1, line2?, subdistrict?, district?, province?,
// postal_code?, is_default }` (contract `CustomerAddress`). Spreads the shared audit +
// optimistic-concurrency columns.
export const customer = pgTable("customer", {
  ...auditColumns,
  name: text().notNull(),
  taxId: text(),
  branchCode: text(),
  addresses: jsonb().notNull().default([]),
  creditTermsDays: integer().notNull().default(0),
  ...versionColumn,
});
