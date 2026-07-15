import { sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { money, qty, versionColumn } from "../../base-columns.js";
import type { AllocMethod, GoodsIssueStatus, GoodsReceiptStatus, IssuePurpose } from "../enums.js";
import { item, uom } from "./catalog.js";

// Stock-moving documents (spec §3.2): goods receipts (landed cost) and goods issues. Both
// post to the append-only ledger on their terminal state; the tables here hold header +
// line drafts up to that point.

// Goods receipt header. Lifecycle DRAFT → CONFIRMED (landed cost allocated across lines by
// `alloc_method`) → POSTED (ledger IN + lots created). `doc_no` is auto-issued and unique.
// Carries the optimistic-concurrency version column.
export const goodsReceipt = pgTable("goods_receipt", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  docNo: text().unique(),
  supplierId: uuid(),
  status: text().$type<GoodsReceiptStatus>().notNull().default("DRAFT"),
  landedCostTotal: money().notNull().default("0"),
  allocMethod: text().$type<AllocMethod>().notNull().default("VALUE"),
  ...versionColumn,
});

// Goods receipt line. `qty` is in `uom_id`; the effective landed unit cost is
// `unit_price + allocated_landed / qty`, computed at CONFIRM.
export const goodsReceiptLine = pgTable("goods_receipt_line", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  receiptId: uuid()
    .notNull()
    .references(() => goodsReceipt.id),
  itemId: uuid()
    .notNull()
    .references(() => item.id),
  qty: qty().notNull(),
  uomId: uuid()
    .notNull()
    .references(() => uom.id),
  unitPrice: money().notNull(),
  allocatedLanded: money().notNull().default("0"),
});

// Goods issue header. Lifecycle DRAFT → POSTED (ledger OUT, costed per the item's costing
// method). `purpose` says why stock leaves; `ref_wo_id` links a PRODUCTION issue to its
// work order (no FK yet — the M4 work_order table adds it). `doc_no` unique.
export const goodsIssue = pgTable("goods_issue", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  docNo: text().unique(),
  purpose: text().$type<IssuePurpose>().notNull(),
  refWoId: uuid(),
  status: text().$type<GoodsIssueStatus>().notNull().default("DRAFT"),
});

// Goods issue line. `qty` is in `uom_id`, converted to base_uom before the ledger OUT is
// written.
export const goodsIssueLine = pgTable("goods_issue_line", {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  issueId: uuid()
    .notNull()
    .references(() => goodsIssue.id),
  itemId: uuid()
    .notNull()
    .references(() => item.id),
  qty: qty().notNull(),
  uomId: uuid()
    .notNull()
    .references(() => uom.id),
});
