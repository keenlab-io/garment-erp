import { sql } from "drizzle-orm";
import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { money, qty } from "../../base-columns.js";

// A polymorphic document line shared by quotations and invoices (spec §5.2). `parent_type` +
// `parent_id` point at the owning `quotation`/`invoice` row — no FK is possible across two
// parent tables, so the pair is indexed instead for line lookups by parent. `item_id` is a
// bare nullable uuid with no `.references()` (design D13): the M3 `item` table isn't applied
// yet, so a later migration adds the constraint. `line_total` is server-computed from
// `qty × unit_price − discount` (design D2).
export const docLine = pgTable(
  "doc_line",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    parentType: text().$type<"QUOTATION" | "INVOICE">().notNull(),
    parentId: uuid().notNull(),
    itemId: uuid(),
    description: text().notNull(),
    qty: qty().notNull(),
    unitPrice: money().notNull(),
    discount: money().notNull().default("0"),
    lineTotal: money().notNull(),
  },
  (t) => [index().on(t.parentType, t.parentId)],
);
