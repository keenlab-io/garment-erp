# M3 — Inventory & Costing: Design

## Context

M3 builds the costing core on M0/M1 primitives, adding no dependency on M2. What it
**reuses verbatim** (verified in the codebase):

- `@erp/utils/money.ts` — `toDecimal(v) → Decimal`, `format(v, scale)`, `formatMoney`,
  `formatQty`, `lineTotal`, `sumMoney`. `decimal.js` is a dep of `@erp/utils` (not
  re-exported), so all costing math stays in `@erp/utils`.
- The append-only trigger template `tooling/drizzle/0001_audit_append_only.sql`
  (`audit_log_no_mutate()` + `BEFORE UPDATE OR DELETE` trigger) and the M0 `drizzle-kit
  generate --custom` recipe for hand-authored migrations (migrations live in
  `tooling/drizzle/`).
- `SequenceService.next('ITEM')` and the seeded `ITEM` `document_sequence` row.
- The five `inventory.*` catalog codes (`packages/contracts/src/permissions/catalog.ts`) —
  no new codes needed.
- `money`/`qty`/`rate`/`auditColumns`/`versionColumn`/`citext`/`notDeleted`
  (`@erp/db/base-columns.ts`) + the `schema/index.ts` barrel pattern.
- `PdfService.renderHtml(html) → Buffer` (`apps/api/src/pdf/`), the pre-registered
  `pdf`/`email`/`line`/`mv-refresh` queues + `BaseWorker` (`apps/api/src/queue/`).
- `EventBusService.publishInTransaction`/`publishAfterCommit` + `@OnEvent` subscribers
  (`apps/api/src/events/`, `audit/audit.subscriber.ts`), `UnitOfWork.withTransaction` +
  `currentExecutor`, `AuditService.requireReason`, `buildPage`, and the
  `withErrors`/`paginated`/`jobAccepted`/`API_PREFIX` contract helpers.
- The `env.schema.ts` boolean-flag pattern (`z.enum(["true","false"]).transform(v => v ===
  "true")`, as in `S3_FORCE_PATH_STYLE`).

What is **net-new**: division/allocation decimal helpers; the `stock_movement` append-only
trigger; the whole `schema/inventory/*`; a barcode library + label template; an
`INVENTORY_ALLOW_NEGATIVE_STOCK` flag; and a dormant `WorkOrderCompleted` backflush consumer.
Sources: `docs/BACKEND_SPEC_M1-M6.md` §3 and `docs/plans/M3-inventory.md`.

## Goals / Non-Goals

**Goals:**

- An append-only, immutable `stock_movement` ledger with a derived `stock_balance` cache that
  is provably reconstructable by replay.
- Correct, decimal-safe valuation under all three costing methods, with landed-cost
  allocation at receipt.
- Atomic, idempotent backflush on production completion (dormant until M4).
- Reason-gated, audited stock adjustments and reconciled counts.
- Operational reports (stock-card, valuation, low-stock, dead-stock) as direct reads.

**Non-Goals:**

- **No frontend** — `apps/web` inventory screens are a separate change.
- **No M6 analytical layer** — materialized views (`mv_stock_valuation`, …) and
  cross-filtered dashboards are M6; M3 ships live operational reads only.
- **No M4 production model** — M3 only *consumes* `WorkOrderCompleted`; the emitter is M4.
- **No notification delivery** — M3 emits `LowStockReached` and enqueues; the email/LINE
  delivery worker is a shared concern (open question), not built here.
- **No barcode scanning workflow** — M3 prints labels; scanning is M4 shop-floor.

## Decisions

### D1. Append-only `stock_movement` ledger via a custom trigger migration

Mirror `0001_audit_append_only.sql`: a `stock_movement_no_mutate()` plpgsql function that
`RAISE EXCEPTION` on any UPDATE/DELETE, plus a `BEFORE UPDATE OR DELETE` trigger, authored as
a `drizzle-kit generate --custom --name=stock_movement_append_only` migration in
`tooling/drizzle/`. INSERT stays permitted. Corrections are new **compensating movements**,
never edits (invariant §3.5). This makes the ledger the immutable source of truth even for
the table owner in the single-role dev DB.

### D2. `stock_balance` is a derived, reconstructable cache

Every `stock_movement` insert updates `stock_balance (item_id, warehouse_id)` — `qty_on_hand`
and `avg_cost` — **in the same transaction** (upsert). The invariant is that replaying all
`stock_movement` rows for an item reproduces `stock_balance` exactly; a `rebuildBalance(item,
warehouse)` routine implements the replay and is asserted by an acceptance test. This keeps
reads O(1) without making the cache authoritative.

### D3. Three costing methods

Applied by `CostingService` when a movement posts:

- **MAV (default):** on IN, `new_avg = (qty_on_hand·avg_cost + in_qty·in_cost) / (qty_on_hand
  + in_qty)`; OUT posts at the current `avg_cost`.
- **FIFO:** OUT consumes `stock_lot` rows oldest-first by `received_at` (tie-break by `id`),
  decrementing `qty_remaining`; an issue spanning lots produces **one movement per lot** at
  that lot's `unit_cost`.
- **STANDARD:** OUT posts at `item.standard_cost`; the actual-vs-standard delta is recorded
  for variance reporting.

All arithmetic uses the new `@erp/utils` helpers (D4) so rounding is uniform.

### D4. Costing decimal helpers in `@erp/utils`

Add `divideMoney(a,b)`, `divideQty(a,b)`, `movingAverage(qty, avg, inQty, inCost)`, and
`allocate(total, weights[])` (proportional split that assigns the rounding remainder to the
largest weight so the parts sum exactly to `total`). These sit on the existing
`toDecimal`/`formatMoney`/`formatQty` and keep `decimal.js` out of `apps/api`. Division and
allocation are the rounding-sensitive operations, so they are unit-tested in `@erp/utils`.

### D5. Base-UOM conversion before the ledger

Every quantity is converted to the item's `base_uom` via `uom_conversion` **before** any
`stock_movement`/`stock_lot`/`stock_balance` write (invariant §3.5). Receipt/issue/adjustment
lines carry their own `uom_id`; the service converts, then posts in base UOM.

### D6. Landed-cost allocation at receipt CONFIRM

On `goods-receipt/{id}/confirm`, allocate `landed_cost_total` across lines by `alloc_method`
(VALUE = by line extended price, WEIGHT = by qty×unit weight, QTY = by qty) using `allocate`
(D4); persist `allocated_landed` per line and set the effective `unit_cost = unit_price +
allocated_landed/qty`. POST then creates `stock_lot` rows at that landed unit cost.

### D7. Negative-stock policy

Add `INVENTORY_ALLOW_NEGATIVE_STOCK` (`z.enum(["true","false"]).default("false").transform`)
to `env.schema.ts`. When `false`, issuing more than `qty_on_hand` → 422 `BUSINESS_RULE`
before any ledger write; when `true`, the OUT posts and on-hand may go negative.

### D8. Backflush — dormant `@OnEvent("WorkOrderCompleted")` consumer

A `BackflushService` subscribes to `WorkOrderCompleted` (emitted by M4, not built yet). In
one transaction it posts FG IN (qty produced, rolled-up cost) and RM OUT per the active BOM ×
produced qty at current cost, then emits `BackflushPosted`. It is **idempotent on `wo_id`**:
if a `BACKFLUSH` movement already references the `wo_id`, it no-ops (M4 may redeliver). It
runs with in-transaction semantics so a partial failure rolls the whole backflush back.

### D8b. Sales-driven stock movements — dormant M5 event consumers

A `SalesStockSubscriber` subscribes to M5's `InvoiceIssued`/`DeliveryNoteIssued` (optional
stock OUT for inventory-linked documents) and `DocumentVoided` (compensating IN when the
document had posted an OUT). Like D8, these consumers ship **dormant** — no emitter exists
until M5 is applied — and mirror the backflush pattern: they run through the same ledger
write path (`stock_movement`/`stock_lot`/`stock_balance`) and are **idempotent on
`(event, correlation_id)`** so an M5 redelivery cannot double-post. Because §7 marks
`InvoiceIssued`/`DocumentVoided` as `sync→M3`, M5 dispatches them via `publishInTransaction`,
so the stock OUT/IN commits atomically with M5's document transaction. This resolves the
earlier "M5 issues stock via M3" phrasing in favor of a single event-driven mechanism owned by
M3 (the module that owns the ledger).

### D9. Barcode-label printing with bwip-js

`POST /barcodes/print` enqueues a label job (202 `{ job_id }`). The worker uses `bwip-js` to
render each SKU/lot barcode to a PNG data-URI embedded in a label HTML template, calls
`PdfService.renderHtml`, and stores the PDF via `StorageService` on the `pdf` queue. bwip-js
is pure-JS (no native build) and covers Code128/QR/EAN.

### D10. `ITEM` sequence renders `AA00001`

The seeded `ITEM` `document_sequence` row uses `format:"{prefix}{seq:0000}"` (4 padding
digits) → `AA0001`, but the spec's item code is `AA00001` (5 digits). Adjust the seed to
`format:"{prefix}{seq:00000}"` (and `padding: 5`).

### D11. Reports: M3 operational vs M6 analytical

M3 owns the **operational** reads — stock-card (opening/movements/closing over
`stock_movement`), valuation (over `stock_balance`), low-stock (`qty_on_hand < min_stock`),
dead-stock (no movement in N months) — as direct queries. M6 later builds the analytical
materialized-view layer (`mv_stock_valuation`, `mv_cogs_monthly`) and cross-filtered
dashboards. The two do not overlap: M3's are live reads; M6's are refreshed aggregates that
must reconcile to M3's stock cards.

## Risks / Trade-offs

- **[Balance cache drift]** — a bug could desync `stock_balance` from the ledger. → The
  ledger is authoritative; `rebuildBalance` + a replay-equivalence acceptance test catch
  drift, and every update is in the posting transaction.
- **[Costing rounding]** — MAV division and landed-cost allocation can lose/gain cents. →
  `divide*`/`allocate` round half-up and `allocate` forces the parts to sum to the total;
  helpers are unit-tested; money stays decimal-string end-to-end.
- **[FIFO movement fan-out]** — an issue spanning many lots creates many movements. →
  Accepted; it's the correct FIFO record and keeps each movement at a single lot cost. The
  `(item, warehouse, at)` index keeps stock-card reads fast.
- **[Backflush idempotency vs redelivery]** — M4 may redeliver `WorkOrderCompleted`. →
  Idempotent on `wo_id` (skip if a `BACKFLUSH` movement exists); the whole backflush is one
  transaction.
- **[Dormant consumer]** — the backflush handler ships before M4 can exercise it. → It is
  unit-tested by emitting a synthetic `WorkOrderCompleted`; no live emitter until M4.
- **[Negative stock]** — allowing it can produce nonsensical valuations. → Default disallow;
  the flag is opt-in and documented.
- **[Notification worker gap]** — `LowStockReached` has no delivery worker yet. → M3 emits +
  enqueues; delivery is deferred to a shared notifications module (open question), so no
  low-stock signal is lost once that worker lands.

## Migration Plan

Additive, pre-release. Depends on M0/M1 (not M2).

1. **Contracts**: `enums/inventory.ts`; `dto/inventory.ts` (`inventoryContract`); register
   `inventory` on the root `contract`. Keep build/typecheck/lint green.
2. **`@erp/utils`**: add and unit-test the costing helpers (D4).
3. **DB**: `schema/inventory/*` (spec §3.2) + inventory enums (+parity) + the
   `stock_movement` index; the `stock_movement_append_only` custom trigger migration; fix the
   `ITEM` seed; seed a default warehouse + base UOMs; `pnpm db:generate` → migrate → seed.
4. **Config**: `INVENTORY_ALLOW_NEGATIVE_STOCK`; add `bwip-js`.
5. **API**: build `apps/api/src/inventory/` services, controllers, and the barcode worker;
   wire into `app.module.ts`.
6. **Tests**: the §3.8 acceptance criteria + ledger-immutability + replay-equivalence.

Acceptance: `pnpm build && typecheck && lint && test` green; item → receipt → issue →
count/adjust → reports driven end-to-end; ledger UPDATE/DELETE rejected by the trigger.

**Rollback**: additive tables only — revert the branch or drop `schema/inventory/*` and the
trigger.

## Open Questions

1. **Notification delivery worker** — who owns the email/LINE worker draining the `email`/
   `line` queues for `LowStockReached` (a shared notifications module vs M3)? M3 emits +
   enqueues regardless.
2. **STANDARD variance storage** — derive variance on read from `stock_movement.unit_cost` vs
   `item.standard_cost`, or persist it in a dedicated `stock_variance` capture? Assumed
   derive-on-read for M3, with the delta computable per movement.
3. **FIFO tie-breaking** — ordering lots with identical `received_at` (assumed secondary sort
   by `id`); confirm if a receipt sequence column is preferred.
4. **`stock_count` COUNTING lock** — how strictly to block movement for counted items during
   COUNTING (a soft guard rejecting posts vs a hard lock); assumed a soft 409 guard.
