# M4 — Production Tracking: Tasks

> Sequenced **after M2 + M3** — M4 reads employee (M2) and item/BOM/department (M3), and its
> `WorkOrderCompleted` drives M3's backflush. Cross-module FKs are bare columns until those
> tables land.

## 1. Contracts — `packages/contracts/src`

- [x] 1.1 Add `enums/production.ts` — `work_order_status` (`PENDING|IN_PROGRESS|COMPLETED|
  CANCELLED`), `work_order_step_status` (`PENDING|IN_PROGRESS|COMPLETED|HOLD|DEFECT|OUTSOURCED`),
  `subcontract_status` (`SENT|OVERDUE|RECEIVED`), scan `action` (`START|FINISH`), and
  `product_type` (`SUBLIMATION|DTF|DTG|…`)
- [x] 1.2 Add `dto/production.ts` — `productionContract` (`pathPrefix: API_PREFIX`,
  `withErrors`): routing-templates; work-orders (`create`, `GET /{id}`, `GET /timeline`);
  wo-steps (`scan`, `hold`, `defects`, `subcontract`); `subcontracts/{id}/receive`;
  `reports/wip`; lists via `paginationQuery` + `paginated`
- [x] 1.3 Register `production: productionContract` on the root `contract` in `dto/index.ts`;
  export new DTO types. (The 3 `production.*` codes already exist in the catalog.)
- [x] 1.4 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. DB schema — `packages/db/src`

- [ ] 2.1 Add production enums to `schema/enums.ts` mirroring `enums/production.ts` (keep the
  `expectTypeOf` parity test green)
- [ ] 2.2 Add `schema/production/routing.ts` — `routing_template` (`product_type`, `is_active`),
  `routing_step` (`unique(template_id, seq)`, `standard_time_min`, `department_id` **bare uuid**)
- [ ] 2.3 Add `schema/production/work-order.ts` — `work_order` (`wo_no` unique, `finished_item_id`
  / `customer_id` **bare uuid**, `qty`, `due_date`, `machine`, `mockup_file_key`, `version`),
  `work_order_step` (`unique(wo_id, routing_step_id)`, `seq`, `status`, `started_at`,
  `finished_at`, `assigned_to` **bare uuid**, `machine`; delay computed in service, not a
  generated column)
- [ ] 2.4 Add `schema/production/scan.ts` — `production_scan` (append-only; `action`, `by_user`,
  `at`), `defect` (`type`, `qty`, `note`), `subcontract` (`vendor`, `sla_due`, `status`)
- [ ] 2.5 Re-export `schema/production/*` from `schema/index.ts`; `pnpm db:generate` and review
- [ ] 2.6 Author the `production_scan_append_only` **custom migration** (`drizzle-kit generate
  --custom --name=production_scan_append_only`) — a `production_scan_no_mutate()` function +
  `BEFORE UPDATE OR DELETE` trigger, mirroring `0001_audit_append_only.sql`
- [ ] 2.7 Add the `WORK_ORDER` seed row to `BASE_SEQUENCES` — `{ key:"WORK_ORDER", prefix:"WO",
  includeYear:true, resetYearly:true, format:"{prefix}{yyyy}{seq:0000}" }` (renders `WO20260001`)
- [ ] 2.8 `pnpm db:migrate && pnpm db:seed` against dev Postgres; confirm tables, the
  `production_scan` trigger, and the `WORK_ORDER` sequence

## 3. Realtime + scheduling infra — `apps/api/src`

- [ ] 3.1 Add a generic authenticated `@SubscribeMessage("join")` handler to `RealtimeGateway`
  (validate the room, `joinRoom(client, room)`); the JWT handshake already gates the socket
- [ ] 3.2 Add a BullMQ **repeatable** monitor job on the `default` queue (cadence configurable,
  default ~60s) + a `BaseWorker` subclass; register the repeatable job at module init (upsert)

## 4. Nest module — `apps/api/src/production`

- [ ] 4.1 `RoutingService` — create/list routing templates + steps
- [ ] 4.2 `WorkOrderService` — create (issue `wo_no` via SequenceService `WORK_ORDER`;
  **materialize** step snapshot from the template), `GET /{id}` detail, `GET /timeline` feed
  (`is_delayed` computed on read)
- [ ] 4.3 `ScanService` — `scan` START/FINISH (append `production_scan`, derive step
  timestamps, WO → IN_PROGRESS on first, re-FINISH → 409), `hold`, `defects`; push
  `StepStarted`/`StepFinished` via `RealtimeGateway.emitToRoom` to `wo:{id}` + `timeline`
- [ ] 4.4 `ProductionMonitorWorker` — the sweep: subcontracts `SENT` & `sla_due<now` → OVERDUE
  (`SubcontractOverdue`); `IN_PROGRESS` steps over `standard_time_min` not yet flagged →
  `StepDelayed` once + `emitToRoom` (idempotent via a delayed flag)
- [ ] 4.5 `SubcontractService` — `subcontract` send (step → OUTSOURCED) and `receive` (→ line)
- [ ] 4.6 `CompletionService` — on last-step FINISH, WO → COMPLETED, emit `WorkOrderCompleted`
  via `publishAfterCommit` (correlation_id auto) with an `audit` block
- [ ] 4.7 `WipReportService` — `GET /reports/wip` (per department: in-progress + delayed counts)
- [ ] 4.8 ts-rest `ProductionController`(s) — in-handler `assertPermissions(user,
  "production.…")`; wrap mutations in `uow.withTransaction`; inject the `@Global`
  `RealtimeGateway`; `ProductionModule` wired into `app.module.ts`
- [ ] 4.9 Verify: `pnpm build && pnpm typecheck && pnpm lint` green; API boots and maps the
  new `/api/v1` production routes

## 5. Tests (spec §4.7)

- [ ] 5.1 Scan START on "Sew" ⇒ step IN_PROGRESS + timer running; exceeding `standard_time_min`
  ⇒ `StepDelayed` emitted, supervisor notified, step flagged delayed in the timeline feed
- [ ] 5.2 Subcontract a step ⇒ OUTSOURCED + SLA countdown; the monitor flips past-SLA → OVERDUE;
  receive ⇒ step returns to the line / timeline continues
- [ ] 5.3 Completing the final step ⇒ WO COMPLETED and exactly one `WorkOrderCompleted`
  (a duplicate delivery does not double-post — M3-side idempotent on `wo_id`)
- [ ] 5.4 Editing a routing template after a WO exists ⇒ that WO's materialized steps unchanged
- [ ] 5.5 Re-FINISH on a COMPLETED step ⇒ 409; `production_scan` UPDATE/DELETE rejected by the trigger

## 6. Verification

- [ ] 6.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
- [ ] 6.2 `pnpm db:generate` clean after migration; `pnpm db:migrate && pnpm db:seed` run
  cleanly against a fresh DB (production tables, `production_scan` trigger, `WORK_ORDER` seq)
- [ ] 6.3 Boot `pnpm dev` and drive: create routing template → create WO (steps materialized,
  `wo_no` `WO20260001`) → scan START/FINISH → run the monitor (delay + overdue) → subcontract
  → complete the final step and observe `WorkOrderCompleted`; connect a socket, join `wo:{id}`,
  and confirm `StepStarted`/`StepFinished`/`StepDelayed` broadcasts
