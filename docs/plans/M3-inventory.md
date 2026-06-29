# M3 — Inventory & Costing (costing core)

Spec: [`../BACKEND_SPEC_M1-M6.md`](../BACKEND_SPEC_M1-M6.md) §3. Recipe & shared
primitives: [`README.md`](README.md), [`M0-foundation.md`](M0-foundation.md).

**Depends on:** M1, M0. **Unblocks:** M4 (backflush), M5 (optional stock OUT), M6
(valuation). **Build before M4.**

Responsibilities: items/SKUs/lots/UOM, the **append-only stock ledger**, goods
receipt (landed cost), goods issue, BOM + roll-up, backflush from production, WIP,
stock count/adjustment, valuation/variance inputs.

---

## 1. Contracts — `dto/inventory.ts`

- Items/SKUs: `POST /items` (`inventory.product.create`; `code` auto via
  SequenceService `ITEM`), `POST /items/{id}/skus`, `POST /barcodes/print` → 202
  `jobAccepted`, `POST /uom-conversions`.
- Receipts (`inventory.receipt.manage`): `POST /goods-receipts`,
  `/{id}/confirm` (allocate landed cost), `/{id}/post` (ledger IN; create lots).
- Issues (`inventory.issue.manage`): `POST /goods-issues`, `/{id}/post`
  (ledger OUT) | 422 insufficient.
- BOM: `POST /boms`, `POST /boms/{id}/rollup` (read-only simulation).
- Counts/adjustments: `POST /stock-counts`, `PUT /stock-counts/{id}/lines`,
  `/{id}/reconcile`; `POST /stock-adjustments` (`reason` required → 400 else),
  `/{id}/approve` (`inventory.adjustment.approve`), `/{id}/post`.
- Reports: `GET /reports/stock-card`, `/valuation`, `/low-stock`, `/dead-stock`
  (cost views require `inventory.cost.view`).

Enums (`enums/inventory.ts`): `item_type` (RAW|FINISHED|CONSUMABLE),
`costing_method` (MAV|FIFO|STANDARD), and the GR/GI/count/adjustment state
machines (spec §3.3). Permissions already in the catalog.

---

## 2. DB schema — `packages/db/src/schema/inventory/`

Mirror spec §3.2: `uom`, `uom_conversion`, `item` (`code` unique, `costing_method`
default MAV, `standard_cost`, `min_stock`, `attributes jsonb`), `sku`, `warehouse`,
`stock_lot` (`qty_remaining`, `unit_cost`), **`stock_movement`** (append-only
ledger — never UPDATE/DELETE; `qty` signed, `direction` IN|OUT|ADJUST, `ref_type`/
`ref_id`), `stock_balance` (derived cache `qty_on_hand`/`avg_cost`, PK
`(item_id, warehouse_id)`), `goods_receipt(_line)`, `goods_issue(_line)`,
`bom(_line)` (`scrap_pct`, `conversion_cost`), `stock_count(_line)`,
`stock_adjustment(_line)`. Index `stock_movement(item_id, warehouse_id, at)`.

Use `qty()`/`money()`/`rate()` helpers. Consider an append-only trigger on
`stock_movement` mirroring `audit_log` (corrections are compensating movements,
never edits). `pnpm db:generate`; migrate.

---

## 3. Nest module — `apps/api/src/inventory/`

All in `uow.withTransaction`, money/qty math via `@erp/utils` decimal helpers
(strings end-to-end). Convert all quantities to `base_uom` via `uom_conversion`
**before** writing the ledger.

- **Costing**:
  - **MAV** (default): on IN posting, `new_avg = (qty_on_hand*avg_cost +
    in_qty*in_cost) / (qty_on_hand + in_qty)`; OUT at current `avg_cost`.
  - **FIFO**: OUT consumes `stock_lot` oldest-first, decrementing `qty_remaining`;
    split into multiple movements when spanning lots (each at its lot cost).
  - **STANDARD**: OUT at `item.standard_cost`; record the actual-vs-standard diff
    for variance reporting.
- **Landed cost**: at receipt CONFIRM, allocate `landed_cost_total` across lines by
  `alloc_method` (VALUE|WEIGHT|QTY); effective `unit_cost = unit_price +
  allocated/qty`.
- **BOM roll-up**: recursive read-only walk of `bom_line` × current cost (+
  `scrap_pct`) + `conversion_cost`, summed bottom-up. No ledger writes.
- **Backflush** (consumes `WorkOrderCompleted` from M4): in ONE transaction post FG
  IN (qty produced, rolled-up cost) and RM OUT per active BOM × produced qty at
  current cost. **Idempotent on `wo_id`** (M4 may redeliver). Emits
  `BackflushPosted`.
- **stock_balance**: every ledger insert updates it in the same tx; it must be
  reconstructable by replaying `stock_movement`.
- **Guards**: adjustment without `reason` → 400 (use M0 `requireReason`); issuing
  more than `qty_on_hand` when negative stock is disallowed → 422.
- Emits `GoodsReceiptPosted`, `GoodsIssued`, `StockAdjusted`, `LowStockReached`,
  `BackflushPosted` (async → M6 MV refresh; LowStock → notifications).

---

## 4. Tests (spec §3.8)

- Receive 20kg roll, issue 5kg ⇒ lot `qty_remaining=15`, ledger IN 20 + OUT 5,
  `stock_balance.qty_on_hand=15`.
- MAV: receive 10@฿100 then 10@฿120 ⇒ `avg_cost=110`; issuing 5 posts OUT @110.
- Backflush producing 100 FG ⇒ FG +100 and each RM −(bom_qty×100×(1+scrap)) at
  current cost, all atomic; a duplicate `WorkOrderCompleted` does not double-post.
- Replaying `stock_movement` reproduces `stock_balance` exactly.
- Adjustment without reason ⇒ 400; with reason ⇒ one `audit_log` row (actor +
  reason + before/after).

Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
