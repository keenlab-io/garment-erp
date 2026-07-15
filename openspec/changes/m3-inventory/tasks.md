# M3 — Inventory & Costing: Tasks

> Depends on M0 + M1 (not M2). M3 **consumes** `WorkOrderCompleted` (emitted by M4, not built
> yet) — the backflush handler ships but stays dormant until M4.

## 1. Contracts — `packages/contracts/src`

- [x] 1.1 Add `enums/inventory.ts` — `item_type` (`RAW|FINISHED|CONSUMABLE`), `costing_method`
  (`MAV|FIFO|STANDARD`), `movement_direction` (`IN|OUT|ADJUST`), `movement_ref_type`
  (`GOODS_RECEIPT|GOODS_ISSUE|BACKFLUSH|ADJUSTMENT|COUNT`), `alloc_method` (`VALUE|WEIGHT|QTY`),
  `issue_purpose` (`PRODUCTION|SALE|OTHER`), and the GR/GI/count/adjustment state machines (§3.3)
- [x] 1.2 Add `dto/inventory.ts` — `inventoryContract` (`pathPrefix: API_PREFIX`, `withErrors`):
  items/skus/uom-conversions, `POST /barcodes/print` → `jobAccepted`, goods-receipts
  (`create`/`confirm`/`post`), goods-issues (`create`/`post`), boms (`create`/`rollup`),
  stock-counts (`create`/`lines`/`reconcile`), stock-adjustments (`create`/`approve`/`post`),
  and reports (stock-card/valuation/low-stock/dead-stock); lists via `paginationQuery` +
  `paginated`
- [x] 1.3 Register `inventory: inventoryContract` on the root `contract` in `dto/index.ts`;
  export new DTO types. (The 5 `inventory.*` codes already exist in the catalog.)
- [x] 1.4 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. `@erp/utils` — costing helpers

- [ ] 2.1 Add `divideMoney(a,b)`, `divideQty(a,b)`, `movingAverage(qtyOnHand, avgCost, inQty,
  inCost)`, and `allocate(total, weights[])` (proportional split; rounding remainder assigned
  to the largest weight so parts sum exactly to `total`) to `money.ts`; export from the barrel
- [ ] 2.2 Unit-test division rounding (half-up) and `allocate` sum-preservation

## 3. DB schema — `packages/db/src`

- [ ] 3.1 Add inventory enums to `schema/enums.ts` mirroring `enums/inventory.ts` (keep the
  `expectTypeOf` parity test green)
- [ ] 3.2 Add `schema/inventory/catalog.ts` — `uom`, `uom_conversion` (PK
  `(item_id, from_uom, to_uom)`), `item` (`code` unique, `costing_method` default MAV,
  `standard_cost`, `min_stock`, `attributes`, audit + `version`), `sku` (unique `sku_code`,
  unique `barcode`), `warehouse`
- [ ] 3.3 Add `schema/inventory/ledger.ts` — `stock_lot` (`qty_remaining`, `unit_cost`,
  `received_at`), `stock_movement` (append-only; `qty` signed, `direction`, `unit_cost`,
  `ref_type`, `ref_id`; index `(item_id, warehouse_id, at)`), `stock_balance` (PK
  `(item_id, warehouse_id)`, `qty_on_hand`, `avg_cost`)
- [ ] 3.4 Add `schema/inventory/documents.ts` — `goods_receipt(_line)` (`allocated_landed`,
  `alloc_method`), `goods_issue(_line)`
- [ ] 3.5 Add `schema/inventory/bom.ts` — `bom` (`unique(finished_item_id, version)`,
  `conversion_cost`, `is_active`), `bom_line` (`scrap_pct`)
- [ ] 3.6 Add `schema/inventory/count.ts` — `stock_count(_line)`, `stock_adjustment(_line)`
- [ ] 3.7 Re-export `schema/inventory/*` from `schema/index.ts`; `pnpm db:generate` and review
- [ ] 3.8 Author the `stock_movement_append_only` **custom migration** (`drizzle-kit generate
  --custom --name=stock_movement_append_only`) — a `stock_movement_no_mutate()` function +
  `BEFORE UPDATE OR DELETE` trigger, mirroring `0001_audit_append_only.sql`
- [ ] 3.9 Fix the `ITEM` seed row → `format:"{prefix}{seq:00000}"`, `padding:5` (renders
  `AA00001`); seed a default `warehouse` and base `uom` rows (idempotent)
- [ ] 3.10 `pnpm db:migrate && pnpm db:seed` against dev Postgres; confirm tables, the
  `stock_movement` trigger, and seeds

## 4. Config & deps

- [ ] 4.1 Add `INVENTORY_ALLOW_NEGATIVE_STOCK` to `config/env.schema.ts`
  (`z.enum(["true","false"]).default("false").transform(v => v === "true")`) + compose/devcontainer env
- [ ] 4.2 Add `bwip-js` to `apps/api` deps

## 5. Nest module — `apps/api/src/inventory`

- [ ] 5.1 `ItemService` / `UomService` — item create (emp-code-style `code` via SequenceService
  `ITEM`), SKUs, UOM conversions; base-UOM conversion helper
- [ ] 5.2 `CostingService` — MAV (movingAverage), FIFO (lot consumption oldest-first, split
  movements per lot), STANDARD (standard_cost + variance delta); landed-cost `allocate`
- [ ] 5.3 `LedgerService` — post `stock_movement` (converted to base UOM) + update
  `stock_balance` in the same tx; `rebuildBalance(item, warehouse)` replay routine
- [ ] 5.4 `GoodsReceiptService` — `create`/`confirm` (landed alloc)/`post` (ledger IN + lots),
  emit `GoodsReceiptPosted`
- [ ] 5.5 `GoodsIssueService` — `create`/`post` (ledger OUT), negative-stock check → 422, emit
  `GoodsIssued`
- [ ] 5.6 `BomService` — create + recursive read-only `rollup` (no ledger writes)
- [ ] 5.7 `BackflushService` — `@OnEvent("WorkOrderCompleted")`; one-tx FG IN + RM OUT per
  active BOM; idempotent on `wo_id` (skip if a `BACKFLUSH` movement references it); emit
  `BackflushPosted`
- [ ] 5.7b `SalesStockSubscriber` — dormant `@OnEvent("InvoiceIssued")` /
  `@OnEvent("DeliveryNoteIssued")` post an optional stock OUT per stocked line at current cost,
  and `@OnEvent("DocumentVoided")` posts a compensating IN when an OUT was posted; idempotent on
  `(event, correlation_id)` (no emitter until M5)
- [ ] 5.8 `StockCountService` — open (snapshot `system_qty`) / lines / reconcile (draft
  adjustment for diffs)
- [ ] 5.9 `StockAdjustmentService` — `requireReason` → 400 else; `approve`/`post` (ledger
  ADJUST); audit block (actor + reason + before/after); emit `StockAdjusted`
- [ ] 5.10 `ReportService` — stock-card, valuation, low-stock, dead-stock; cost columns gated
  by `inventory.cost.view`; emit `LowStockReached` when on-hand crosses `min_stock`
- [ ] 5.11 `BarcodeService` + label `@Processor('pdf')` worker — bwip-js → data-URI in label
  HTML → `PdfService.renderHtml` → `StorageService.put` → 202 `{ job_id }`
- [ ] 5.12 ts-rest `InventoryController`(s) — in-handler `assertPermissions(user,
  "inventory.…")`; wrap mutations in `uow.withTransaction`; `InventoryModule` imports
  Pdf/Storage/Queue; wire into `app.module.ts`
- [ ] 5.13 Verify: `pnpm build && pnpm typecheck && pnpm lint` green; API boots and maps the
  new `/api/v1` inventory routes

## 6. Tests (spec §3.8)

- [ ] 6.1 Receive 20kg roll, issue 5kg ⇒ lot `qty_remaining=15`, ledger IN 20 + OUT 5,
  `stock_balance.qty_on_hand=15`
- [ ] 6.2 MAV: receive 10@฿100 then 10@฿120 ⇒ `avg_cost=110`; issuing 5 posts OUT @110
- [ ] 6.3 Backflush producing 100 FG ⇒ FG +100 and each RM −(bom_qty×100×(1+scrap)) at current
  cost, all atomic; a duplicate `WorkOrderCompleted` does not double-post (idempotent on wo_id)
- [ ] 6.4 Replaying `stock_movement` reproduces `stock_balance` exactly (`rebuildBalance`)
- [ ] 6.5 Adjustment without `reason` ⇒ 400; with reason ⇒ one `audit_log` row (actor + reason
  + before/after)
- [ ] 6.6 Ledger immutability: UPDATE/DELETE on `stock_movement` rejected by the trigger
- [ ] 6.7 FIFO issue spanning two lots ⇒ two OUT movements at each lot's cost; landed-cost
  allocation sums to `landed_cost_total`

## 7. Verification

- [ ] 7.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
- [ ] 7.2 `pnpm db:generate` clean after migration; `pnpm db:migrate && pnpm db:seed` run
  cleanly against a fresh DB (tables, trigger, `AA00001` item code, default warehouse/UOMs)
- [ ] 7.3 Boot `pnpm dev` and drive: create item (`AA00001`) → receipt (confirm landed → post)
  → issue → stock count → adjustment → stock-card/valuation reports; confirm a barcode-print
  job returns 202
