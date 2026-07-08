# M4 — Production Tracking: Design

## Context

M4 builds shop-floor tracking on M0 primitives and consumes/produces cross-module events.
What it **reuses verbatim** (verified in the codebase):

- `RealtimeGateway` (`apps/api/src/realtime/`, `@Global`) — `emitToRoom(room, event,
  payload)` and `joinRoom(client, room)`, JWT socket handshake via `TokenService.verifyAccess`
  (token from `handshake.auth.token` or a bearer header). Its doc comment names M4's rooms;
  **it has no consumer yet** — M4 is the first.
- `EventBusService.publishInTransaction`/`publishAfterCommit` + `makeEvent(...)`
  (`apps/api/src/events/`) — `correlation_id` auto-defaults to the active unit-of-work id, so
  `WorkOrderCompleted` carries the WO's correlation id for M3 backflush. `@OnEvent("**")`
  (audit subscriber) already writes an `audit_log` row for any payload with an `audit` block.
- `SequenceService.next('WORK_ORDER')` (`sequence/`) — renders `{prefix}{yyyy}{seq:0000}`;
  **throws `NotFoundError` for an unseeded key**, so the `WORK_ORDER` row must be seeded.
- `QueueModule` (`@Global`) + `BaseWorker` + the registered `default` queue — for the monitor
  job. `DEFAULT_JOB_OPTIONS` = 5 attempts, exp backoff, keep last 1000.
- The `0001_audit_append_only.sql` trigger template + the `drizzle-kit generate --custom`
  recipe, `qty`/`auditColumns`/`versionColumn` base columns + the schema-barrel pattern,
  `UnitOfWork.withTransaction` + `currentExecutor`, `AppException` subclasses, `buildPage`,
  and the `withErrors`/`paginated`/`API_PREFIX` contract helpers.
- The three `production.*` catalog codes (`production.scan` — intentionally two-segment —
  `production.subcontract.manage`, `production.wo.manage`).

What is **net-new**: the entire `schema/production/*`; a `WORK_ORDER` sequence seed row; a
`production_scan` append-only trigger; the first BullMQ **repeatable** job (no scheduling
infra exists); a client room-join handler on the gateway; and the first realtime producer.
Sources: `docs/BACKEND_SPEC_M1-M6.md` §4 and `docs/plans/M4-production.md`.

## Goals / Non-Goals

**Goals:**

- Faithful WO/step/subcontract state machines with scan-driven, append-only step tracking.
- Snapshot step materialization so template edits never mutate live work orders.
- Proactive delay and overdue detection with realtime supervisor alerts.
- Correct completion → `WorkOrderCompleted` emission that drives M3 backflush idempotently.
- A live timeline/Gantt feed and a WIP/bottleneck report.

**Non-Goals:**

- **No frontend** — the Gantt UI and shop-floor scan screens are a separate change; M4 ships
  the feed data and realtime broadcasts.
- **No M3 backflush logic** — M4 only *emits* `WorkOrderCompleted`; M3 owns the backflush.
- **No notification delivery** — M4 emits `StepDelayed`/`SubcontractOverdue` and pushes
  realtime; the email/LINE delivery worker is a shared concern (open question).
- **No M2/M3/M5 tables** — cross-module references are bare columns; FKs come later.

## Decisions

### D1. Step materialization is a snapshot

Creating a WO copies each `routing_step`'s `seq` and `standard_time_min` into a
`work_order_step` row. The WO tracks against this snapshot, so editing the template
afterward does not change existing WOs (acceptance criterion §4.7).

### D2. `wo_no` via a seeded WORK_ORDER sequence

Seed a `document_sequence` row `{ key: "WORK_ORDER", prefix: "WO", includeYear: true,
resetYearly: true, padding: 4, format: "{prefix}{yyyy}{seq:0000}" }` → `WO20260001`, matching
the yearly-reset convention of QUOTATION/INVOICE. Without it, `next("WORK_ORDER")` throws
`NotFoundError`.

### D3. Append-only `production_scan`

Scans are immutable facts. Mirror `0001_audit_append_only.sql` as a hand-written
`production_scan_no_mutate()` function + `BEFORE UPDATE OR DELETE` trigger migration (with the
`--> statement-breakpoint` marker). Step `started_at`/`finished_at` derive from the earliest
START / latest FINISH scan.

### D4. Scan semantics and delay computation

`START` sets `started_at`, step → IN_PROGRESS, and WO → IN_PROGRESS if it's the first step to
start. `FINISH` sets `finished_at`, step → COMPLETED. Re-scanning FINISH on a COMPLETED step
→ 409. A step is delayed when `actual_minutes(started → finished, or now if running) >
standard_time_min`, computed in the service/timeline view — **not** the spec's placeholder
generated column (which can't compare against the step's own standard).

### D5. Monitor sweep — the first repeatable job

No scheduling infra exists, so M4 adds a BullMQ **repeatable** job on the `default` queue
(cadence configurable, default ~60s) via a `BaseWorker` subclass. Each tick, in one pass:
- subcontracts in `SENT` with `sla_due < now` → OVERDUE, emitting `SubcontractOverdue`;
- `IN_PROGRESS` steps with elapsed > `standard_time_min` **not yet flagged** → set a delayed
  flag, emit `StepDelayed` once (idempotent), and push to the realtime rooms.
BullMQ is already a dependency, so no `@nestjs/schedule` is added. The worker is idempotent
(emit-once via the flag) so redelivery doesn't duplicate alerts.

### D6. Realtime — reuse the gateway, add a client-join path

M4 injects the `@Global` `RealtimeGateway` and pushes `StepStarted`/`StepFinished`/
`StepDelayed` to `wo:{id}` and `timeline` via `emitToRoom`. The gateway currently only
server-emits — there is no way for a client to join a room — so M4 adds a generic
authenticated `@SubscribeMessage("join")` handler (validating the requested room) so clients
subscribe to `wo:{id}`/`timeline`. This is the MODIFIED `realtime-gateway` capability.

### D7. Completion → `WorkOrderCompleted` via after-commit

When the last step completes, the WO transitions to COMPLETED and emits
`WorkOrderCompleted{wo_id, finished_item_id, qty}` via **`publishAfterCommit`** — so WO
completion is not rolled back by a backflush failure. `correlation_id` auto-propagates from
the unit of work. M3's consumer runs in its own transaction and is idempotent on `wo_id`
(§4.4), which is why after-commit (rather than the §7 catalog's "sync→M3" label) is the safe
choice; the dispatch is still in-process and synchronous relative to the commit. An `audit`
block on the payload gives free audit logging.

### D8. Cross-module FKs as bare columns

`work_order.finished_item_id` → item, `routing_step.department_id` → department,
`work_order_step.assigned_to` → employee, and `work_order.customer_id` → M5 customer are
declared as **bare nullable `uuid()` columns with no FK constraint**, mirroring the
`auditColumns` `created_by`/`updated_by` no-FK pattern. `item`/`department`/`employee` don't
exist yet (M2/M3 are proposals) and `customer` has no owning module. The FK constraints are
added by a later migration once those tables land; this keeps M4's schema authorable and
lets `/opsx:apply` sequence M4 after M2 + M3 without a hard schema block.

### D9. Timeline feed and WIP report

`GET /work-orders/timeline?from=&to=&status=` returns WOs with their steps
(`name, status, started_at, finished_at, is_delayed` computed on-read) — the Gantt feed.
`GET /reports/wip` aggregates IN_PROGRESS and delayed steps per department for the
bottleneck view.

## Risks / Trade-offs

- **[First realtime producer]** — no prior example of pushing to rooms. → Reuse
  `emitToRoom`; the join-handler addition is small and generic; broadcasts to zero
  subscribers are harmless until a client connects.
- **[Monitor idempotency]** — the sweep could double-emit `StepDelayed`. → Emit once via a
  persisted delayed flag; the worker is idempotent, and BullMQ repeatable jobs are upserted
  (not re-added) at init.
- **[Completion/backflush coupling]** — emitting in-tx would let a backflush failure roll back
  the WO completion. → `publishAfterCommit` + M3-side idempotency on `wo_id` decouples them;
  the WO is durably COMPLETED regardless of backflush timing.
- **[Bare cross-module columns]** — no referential integrity to item/employee/department yet.
  → Accepted until M2/M3 land; a later migration adds the FKs; `/opsx:apply` sequences M4
  after M2 + M3 so the referenced rows exist at runtime.
- **[Scan race]** — concurrent scans on one step. → Scans are append-only facts; step status
  and timestamps derive from the scan set within the posting transaction; the WO/step carry
  optimistic `version` where mutated.
- **[Notification delivery gap]** — `StepDelayed`/`SubcontractOverdue` have no delivery
  worker. → M4 emits + realtime-pushes; email/LINE delivery is deferred to a shared
  notifications module (open question), so no alert is lost once that worker lands.

## Migration Plan

Additive, pre-release. **Sequenced after M2 + M3** (reads employee/item/department; drives
M3 backflush).

1. **Contracts**: `enums/production.ts`; `dto/production.ts` (`productionContract`); register
   `production` on the root `contract`. Keep build/typecheck/lint green.
2. **DB**: `schema/production/*` (bare cross-module columns) + production enums (+parity) +
   the `production_scan` append-only trigger migration + the `WORK_ORDER` seed row;
   `pnpm db:generate` → migrate → seed.
3. **Infra**: add the `@SubscribeMessage("join")` handler; the BullMQ repeatable monitor job
   + `BaseWorker` subclass.
4. **API**: build `apps/api/src/production/` services, controllers, and the monitor worker;
   inject `RealtimeGateway`; wire into `app.module.ts`.
5. **Tests**: the §4.7 acceptance criteria.

Acceptance: `pnpm build && typecheck && lint && test` green; routing → WO (steps
materialized) → scan → delay/overdue sweep → subcontract → completion emits
`WorkOrderCompleted`; realtime broadcasts to `wo:{id}`.

**Rollback**: additive tables only — revert the branch or drop `schema/production/*` and the
trigger; the seeded `WORK_ORDER` row is idempotent.

## Open Questions

1. **Notification delivery worker** — ownership of the email/LINE worker draining the
   `email`/`line` queues for `StepDelayed`/`SubcontractOverdue` (a shared notifications
   module vs M4). M4 emits + realtime-pushes regardless.
2. **Monitor cadence** — default ~60s; confirm the acceptable alert latency vs sweep cost.
3. **`WorkOrderCompleted` dispatch** — after-commit chosen (D7) for decoupling; reconcile
   with the §7 catalog's "sync→M3" label (both are in-process; the difference is tx scope).
4. **`assigned_to` vs scan actor** — `work_order_step.assigned_to` is the planned assignee;
   `production_scan.by_user` is who actually scanned. Confirm whether reporting keys off one
   or both.
