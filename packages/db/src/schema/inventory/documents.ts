import { sql } from "drizzle-orm";
import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { money, qty, tenantColumn, versionColumn } from "../../base-columns.js";
import { tenantFk } from "../platform/tenant.js";
import type { AllocMethod, GoodsIssueStatus, GoodsReceiptStatus, IssuePurpose } from "../enums.js";
import { item, uom } from "./catalog.js";

// Stock-moving documents (spec §3.2): goods receipts (landed cost) and goods issues. Both
// post to the append-only ledger on their terminal state; the tables here hold header +
// line drafts up to that point.

// Goods receipt header. Lifecycle DRAFT → CONFIRMED (landed cost allocated across lines by
// `alloc_method`) → POSTED (ledger IN + lots created). `doc_no` is auto-issued and unique.
// Carries the optimistic-concurrency version column.
export const goodsReceipt = pgTable(
  "goods_receipt",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    docNo: text(),
    supplierId: uuid(),
    status: text().$type<GoodsReceiptStatus>().notNull().default("DRAFT"),
    landedCostTotal: money().notNull().default("0"),
    allocMethod: text().$type<AllocMethod>().notNull().default("VALUE"),
    ...versionColumn,
  },
  (t) => [
    tenantFk(t),
    unique("goods_receipt_tenant_doc_no_uq").on(t.tenantId, t.docNo),
  ],
);

// Goods receipt line. `qty` is in `uom_id`; the effective landed unit cost is
// `unit_price + allocated_landed / qty`, computed at CONFIRM.
export const goodsReceiptLine = pgTable(
  "goods_receipt_line",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
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
  },
  (t) => [tenantFk(t)],
);

// Goods issue header. Lifecycle DRAFT → POSTED (ledger OUT, costed per the item's costing
// method). `purpose` says why stock leaves; `ref_wo_id` links a PRODUCTION issue to its
// work order (no FK yet — the M4 work_order table adds it). `doc_no` unique.
export const goodsIssue = pgTable(
  "goods_issue",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
    docNo: text(),
    purpose: text().$type<IssuePurpose>().notNull(),
    refWoId: uuid(),
    status: text().$type<GoodsIssueStatus>().notNull().default("DRAFT"),
  },
  (t) => [
    tenantFk(t),
    unique("goods_issue_tenant_doc_no_uq").on(t.tenantId, t.docNo),
  ],
);

// Goods issue line. `qty` is in `uom_id`, converted to base_uom before the ledger OUT is
// written.
export const goodsIssueLine = pgTable(
  "goods_issue_line",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ...tenantColumn,
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
  },
  (t) => [tenantFk(t)],
);
