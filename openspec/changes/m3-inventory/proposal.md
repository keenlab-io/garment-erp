# M3 — Inventory & Costing

## Why

M3 is the ERP's **costing core** (ADR-004): it turns physical stock movements into an
auditable, valued ledger that every downstream module reads. Nothing in M0–M2 tracks an
item, a lot, or a stock balance; M4 (production backflush), M5 (optional stock deduction on
delivery), and M6 (valuation/COGS reporting) all assume M3's ledger and cost figures exist.
Building it once — with an append-only movement ledger, a reconstructable balance cache, and
the three costing methods (moving average, FIFO, standard) — prevents each downstream module
from reinventing valuation inconsistently.

The heart of M3 is the **append-only `stock_movement` ledger**: every IN/OUT/ADJUST is an
immutable fact, `stock_balance` is a derived cache that must be reproducible by replaying the
ledger, and corrections are new compensating movements rather than edits. On top of that sit
goods receipt (with landed-cost allocation), goods issue, BOM roll-up, backflush from
production, stock count/adjustment, and the operational valuation reports.

The backend contract is implementation-ready in `docs/BACKEND_SPEC_M1-M6.md` §3 and
`docs/plans/M3-inventory.md`; this change captures it as spec-driven artifacts. Scope is
**backend only** (`@erp/contracts`, `@erp/db`, `@erp/utils`, `apps/api`). M3 reuses M0/M1
infra and adds no dependency on M2. It **consumes** `WorkOrderCompleted` from M4, which is
not built yet — so the backflush handler is defined but dormant until M4 lands.

## What Changes

- **Item catalog**: `item` (auto `code` `AA00001` via SequenceService, `costing_method`,
  `standard_cost`, `min_stock`), `sku` (variants, barcodes), `uom` + `uom_conversion`,
  `warehouse`, and `POST /barcodes/print` (a label-PDF job rendered with **bwip-js**).
- **Append-only stock ledger**: `stock_movement` enforced immutable at the database level
  (a trigger mirroring the M0 `audit_log` pattern), `stock_lot`, and the derived
  `stock_balance` cache updated in the same transaction as every ledger insert and
  reconstructable by replaying the ledger. All quantities convert to `base_uom` before any
  write.
- **Three costing methods**: MAV (default; moving-average recompute on IN, OUT at avg), FIFO
  (consume lots oldest-first, splitting an issue across lots at each lot's cost), and
  STANDARD (OUT at `standard_cost`, capturing actual-vs-standard variance) — with new decimal
  division/allocation helpers in `@erp/utils`.
- **Goods receipt**: `DRAFT → CONFIRMED (landed-cost allocation) → POSTED (ledger IN, create
  lots)`; landed cost allocated across lines by `alloc_method` (VALUE|WEIGHT|QTY).
- **Goods issue**: `DRAFT → POSTED (ledger OUT)`; issuing beyond on-hand → 422 when negative
  stock is disallowed (a new `INVENTORY_ALLOW_NEGATIVE_STOCK` config flag).
- **BOM + roll-up**: `bom` / `bom_line` (`scrap_pct`, `conversion_cost`) and a recursive
  **read-only** cost roll-up.
- **Backflush**: on `WorkOrderCompleted` (from M4), in one transaction post FG IN (rolled-up
  cost) and RM OUT per active BOM × produced qty at current cost — **idempotent on `wo_id`**.
- **Stock count & adjustment**: count `OPEN → COUNTING → RECONCILED → ADJUSTED → CLOSED`
  (reconcile drafts an adjustment for diffs), adjustment `DRAFT → APPROVED → POSTED (ledger
  ADJUST)` with a **mandatory `reason`** → audited.
- **Operational reports**: stock-card, valuation, low-stock, dead-stock (cost views require
  `inventory.cost.view`); emits `LowStockReached` when on-hand drops below `min_stock`.
- **Emits** `GoodsReceiptPosted`, `GoodsIssued`, `StockAdjusted`, `LowStockReached`,
  `BackflushPosted` (async consumers: M6 view refresh, notifications).

No breaking changes (pre-release). The five `inventory.*` permission codes already exist in
the `@erp/contracts` catalog.

## Capabilities

### New Capabilities

- `item-catalog`: items (auto code), SKUs/variants/barcodes, UOM + conversions, warehouses,
  and barcode-label printing.
- `stock-ledger`: the append-only `stock_movement` ledger, `stock_lot`, and the derived,
  reconstructable `stock_balance` cache, with base-UOM conversion before every write.
- `costing`: moving-average, FIFO, and standard costing applied when posting movements.
- `goods-receipt`: the receipt lifecycle with landed-cost allocation and ledger IN.
- `goods-issue`: the issue lifecycle with ledger OUT and negative-stock enforcement.
- `bom`: bills of materials and read-only cost roll-up.
- `backflush`: production-completion consumption that posts FG IN and RM OUT atomically,
  idempotently.
- `sales-stock-integration`: dormant `@OnEvent` consumers that post an optional stock OUT on
  M5's `InvoiceIssued`/`DeliveryNoteIssued` and a compensating IN on `DocumentVoided`,
  idempotent on `(event, correlation_id)`.
- `stock-count-adjustment`: physical counts, reconciliation, and reason-gated adjustments
  posted to the ledger.
- `inventory-reports`: operational stock-card, valuation, low-stock, and dead-stock reads,
  with low-stock signalling.

### Modified Capabilities

None — M3 adjusts the `ITEM` sequence seed and extends `@erp/utils` with costing helpers,
which are not spec-requirement changes to an existing capability.

## Impact

- **Packages**
  - `@erp/contracts` — new `enums/inventory.ts` and `dto/inventory.ts` (`inventoryContract`),
    registered under a new `inventory` key on the root `contract`.
  - `@erp/utils` — new `divideMoney`/`divideQty`/`movingAverage`/`allocate` decimal helpers
    (on the existing `decimal.js`-backed money module).
  - `@erp/db` — new `schema/inventory/` (spec §3.2 tables), inventory enums in
    `schema/enums.ts` (parity-tested), a `stock_movement` index, a custom append-only trigger
    migration, the `ITEM` seed format corrected to render `AA00001`, and a seeded default
    warehouse + base UOMs.
  - `apps/api` — new `inventory/` module (item/UOM, costing, ledger, goods-receipt/issue,
    BOM, backflush, count/adjustment, reports, barcode worker) wired into `app.module.ts`.
- **New runtime dependency**: `bwip-js` (barcode rendering).
- **Config**: add `INVENTORY_ALLOW_NEGATIVE_STOCK` to the validated env (default `false`).
- **Infra**: none new — reuses the `pdf`/`email`/`line`/`mv-refresh` queues, Storage, and
  Postgres. Note: an actual email/LINE **delivery worker** for `LowStockReached` does not yet
  exist (only queue names) — M3 emits the event and enqueues; delivery-worker ownership is an
  open question.
- **Downstream/sequencing**: M4 will emit the `WorkOrderCompleted` that M3's dormant backflush
  consumer awaits; M3 also consumes M5's `InvoiceIssued`/`DeliveryNoteIssued` (optional stock
  OUT) and `DocumentVoided` (compensating IN) via dormant handlers that fire once M5 lands;
  M6 reads valuation. M3 depends on M0/M1 only, so it can be implemented independently of M2.
