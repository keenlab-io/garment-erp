# M4 — Production Tracking

Spec: [`../BACKEND_SPEC_M1-M6.md`](../BACKEND_SPEC_M1-M6.md) §4. Recipe & shared
primitives: [`README.md`](README.md), [`M0-foundation.md`](M0-foundation.md).

**Depends on:** M3 (item/BOM; emits `WorkOrderCompleted` → backflush), M2
(employee assignment), M0 (realtime). Reads M5 customer.

Responsibilities: routing templates & steps with standard times, work orders,
per-step shop-floor scanning (actual time + delay detection), defects,
subcontracting with SLA, timeline/Gantt feed, WIP/bottleneck inputs, and
triggering M3 backflush on completion.

---

## 1. Contracts — `dto/production.ts`

- `POST /routing-templates` `{name,product_type,steps[]}` (`production.wo.manage`).
- `POST /work-orders` (`wo_no` auto; steps materialized), `GET /work-orders/{id}`,
  `GET /work-orders/timeline` (Gantt feed).
- `POST /wo-steps/{id}/scan` `{action:'START'|'FINISH'}` (`production.scan`) | 409,
  `/{id}/hold` `{reason}`, `/{id}/defects` `{type,qty,note}`, `/{id}/subcontract`
  `{vendor,sla_due}` (`production.subcontract.manage`),
  `POST /subcontracts/{id}/receive`.
- `GET /reports/wip` (bottleneck view).

Enums (`enums/production.ts`): `work_order.status`, `work_order_step.status`,
`subcontract.status` (spec §4.3). Realtime over Socket.IO rooms `wo:{id}` and
`timeline`.

---

## 2. DB schema — `packages/db/src/schema/production/`

Spec §4.2: `routing_template`, `routing_step` (`unique(template_id, seq)`,
`standard_time_min`), `work_order` (`wo_no` unique, `routing_template_id`,
`mockup_file_key`), `work_order_step` (`unique(wo_id, routing_step_id)`;
`started_at`/`finished_at`/`assigned_to`/`machine`; **delay computed in the
service/view**, not the spec's placeholder generated column),
`production_scan` (append-only), `defect`, `subcontract`. `qty()` helper for
quantities.

---

## 3. Nest module — `apps/api/src/production/`

- WO creation **materializes** `work_order_step` rows by copying the template's
  steps (seq, `standard_time_min`) — a snapshot, so later template edits don't
  mutate live WOs. `wo_no` via SequenceService.
- **Scan START**: set `started_at`, step → IN_PROGRESS, WO → IN_PROGRESS if first.
  **Scan FINISH**: set `finished_at`, step → COMPLETED. Scans are append-only;
  timestamps derived from earliest START / latest FINISH. Re-FINISH on a COMPLETED
  step → 409.
- **Delay**: a step is delayed when `actual_minutes(started→finished, or now if
  running) > standard_time_min`; emit `StepDelayed` (async → notifications + push
  to room `wo:{id}` / `timeline`).
- **Subcontract**: send sets step → OUTSOURCED + `subcontract.status=SENT`; a
  scheduler flips to OVERDUE past `sla_due` (`SubcontractOverdue`); receive → back
  to the line.
- **Completion → backflush**: when the **last** step is COMPLETED, WO → COMPLETED
  and emit `WorkOrderCompleted{wo_id, finished_item_id, qty}` with the request's
  `correlation_id`. M3 consumes it (FG IN, RM OUT); backflush is idempotent on
  `wo_id` so a redelivered event doesn't double-post.
- Realtime: push `StepStarted`/`StepFinished`/`StepDelayed` to `wo:{id}` and
  `timeline` via the M0 `RealtimeGateway`.
- Emits `WorkOrderCreated`/`Started`/`Completed`, `Step*`, `DefectRecorded`,
  `SubcontractOverdue`.

---

## 4. Tests (spec §4.8)

- Scan START on "Sew" ⇒ step IN_PROGRESS + timer; exceeding `standard_time_min` ⇒
  `StepDelayed` emitted, supervisor notified, step flagged delayed in the feed.
- Subcontract a step ⇒ OUTSOURCED + SLA countdown; receive ⇒ timeline continues.
- Completing the final step ⇒ WO COMPLETED and exactly one M3 backflush (duplicate
  `WorkOrderCompleted` does not double-post).
- Editing a routing template after a WO exists does not change that WO's
  materialized steps.

Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
