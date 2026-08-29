# M4 — Production Tracking

## Why

M4 runs the shop floor: it turns a routing template into a live work order, tracks each
step through scan-based start/finish with actual-time and delay detection, records defects
and subcontracting, feeds a timeline/Gantt view and WIP/bottleneck reports, and — on
completion — emits `WorkOrderCompleted` so **M3 backflushes** finished goods in and raw
materials out. Nothing before M4 models production; M3 even ships a *dormant* backflush
consumer that only fires once M4 emits this event. M4 is also the **first consumer of M0's
realtime gateway** — the gateway was built for M4's `wo:{id}` and `timeline` rooms but has
had no producer until now.

The backend contract is implementation-ready in `docs/BACKEND_SPEC_M1-M6.md` §4 and
`docs/plans/M4-production.md`; this change captures it as spec-driven artifacts. Scope is
**backend only** (`@erp/contracts`, `@erp/db`, `apps/api`). M4 reads employee (M2), item &
BOM (M3), and customer (M5) — those tables don't exist yet, so cross-module references are
bare columns and M4's *implementation* sequences after M2 + M3.

## What Changes

- **Routing templates**: `routing_template` + `routing_step` (`unique(template_id, seq)`,
  `standard_time_min`, optional `department_id`).
- **Work orders**: `work_order` (auto `wo_no` `WO20260001`); creating a WO **materializes**
  `work_order_step` rows by **snapshotting** the template's steps, so editing a template
  afterward never mutates a live WO. WO lifecycle `PENDING → IN_PROGRESS → COMPLETED |
  CANCELLED`, with a `GET /work-orders/{id}` detail and a `GET /work-orders/timeline` Gantt
  feed.
- **Shop-floor scanning**: append-only `production_scan`; scan `START`/`FINISH` sets step
  timestamps and status (WO → IN_PROGRESS on the first START), re-FINISH on a COMPLETED step
  → 409; plus step `hold` and `defects`.
- **Delay detection**: a step is delayed when elapsed time exceeds `standard_time_min`
  (computed in the service, not a generated column); a **repeatable monitor sweep** emits
  `StepDelayed` once for newly-late running steps and pushes it to the realtime rooms.
- **Subcontracting**: send a step (→ OUTSOURCED, `SENT`); the monitor sweep flips
  `SENT → OVERDUE` past `sla_due` (`SubcontractOverdue`); `receive` returns the step to the
  line.
- **Completion → backflush**: when the last step completes, WO → COMPLETED and emit
  `WorkOrderCompleted{wo_id, finished_item_id, qty}` carrying the unit-of-work
  `correlation_id`; M3 consumes it (idempotent on `wo_id`).
- **WIP reporting**: `GET /reports/wip` bottleneck view (per department: `in_progress_count`,
  `delayed_count`).
- **Realtime**: reuse the M0 `RealtimeGateway` to push `StepStarted`/`StepFinished`/
  `StepDelayed` to `wo:{id}` and `timeline`, and **add a client room-join handler** (the
  gateway currently only server-emits).
- **Infra housekeeping**: seed a `WORK_ORDER` `document_sequence` row (absent today); add a
  `production_scan` append-only trigger; add a BullMQ **repeatable monitor job** (no
  scheduling infra exists yet).

No breaking changes (pre-release). The three `production.*` permission codes already exist
in the `@erp/contracts` catalog.

## Capabilities

### New Capabilities

- `routing-templates`: reusable routing templates and their ordered steps with standard
  times.
- `work-orders`: work orders with auto numbering, snapshot step materialization, lifecycle,
  detail, and the timeline/Gantt feed.
- `shop-floor-scanning`: append-only scan facts driving step start/finish, plus holds and
  defect recording.
- `delay-detection`: running-step delay detection and `StepDelayed` alerting via the monitor
  sweep.
- `subcontracting`: subcontracting a step with SLA, overdue flipping, and receipt back to the
  line.
- `production-completion`: work-order completion emitting `WorkOrderCompleted` to trigger M3
  backflush.
- `wip-reporting`: the WIP/bottleneck report over in-progress and delayed steps.

### Modified Capabilities

- `realtime-gateway`: add an authenticated client **room-join** path (`@SubscribeMessage`),
  so clients can subscribe to `wo:{id}` / `timeline` — the M0 gateway only server-emits
  today.

## Impact

- **Packages**
  - `@erp/contracts` — new `enums/production.ts` and `dto/production.ts`
    (`productionContract`), registered under a new `production` key on the root `contract`.
  - `@erp/db` — new `schema/production/` tables, production enums in `schema/enums.ts`
    (parity-tested), a `production_scan` append-only trigger migration, and a seeded
    `WORK_ORDER` `document_sequence` row. Cross-module references (`finished_item_id`,
    `department_id`, `assigned_to`, `customer_id`) are **bare nullable `uuid()` columns**
    until M2/M3/M5 land.
  - `apps/api` — new `production/` module (routing, work orders, scanning, monitor worker,
    subcontracting, completion, WIP report) wired into `app.module.ts`; a
    `@SubscribeMessage("join")` handler added to `RealtimeGateway`.
- **New dependencies**: none — BullMQ (already present) backs the repeatable monitor job.
- **Infra**: no new services. Reuses the `default` queue (monitor), the `email`/`line`
  queues (notifications — note: no delivery worker exists yet; M4 emits + realtime-pushes),
  and the realtime gateway.
- **Downstream/sequencing**: M4's `WorkOrderCompleted` fires M3's dormant backflush; M5 may
  auto-draft an invoice from it. M4 implementation sequences **after M2 + M3** (it reads
  employee/item/department); the FKs to those tables are added by a later migration.
