# M6 — Reporting & Analytics: Tasks

> **Build last.** The materialized views read M3 (`stock_balance`/`stock_movement`) and M5
> (`invoice`) tables, so the MV migration is sequenced **after** M3/M5 and the MV-refresh
> consumers stay dormant until M3/M5 emit. All 7 codes (`report.*` + `inventory.cost.view`)
> already exist in the catalog.

## 1. Contracts — `packages/contracts/src`

- [x] 1.1 Add `enums/reporting.ts` — `export_format` (`PDF | EXCEL | CSV`), `export_status`
  (`PENDING | RUNNING | DONE | FAILED`), `report_group` (`INVENTORY|SALES|COST|PROFIT|TAX`)
- [x] 1.2 Add `dto/reporting.ts` — `reportingContract` (`pathPrefix: API_PREFIX`,
  `withErrors`): `GET /reports/{report_key}` → `{ columns[], rows[], totals }`;
  `GET /dashboards/{key}` → `{ panels[] }`; `POST /reports/{report_key}/export` → `jobAccepted`
  (202); `GET /exports/{job_id}` → `{ status, file_url? }`; report-schedules CRUD +
  `run-now` (202)
- [x] 1.3 Register `reporting: reportingContract` on the root `contract` in `dto/index.ts`;
  export the new DTO types
- [x] 1.4 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. DB schema + materialized views — `packages/db/src`

- [x] 2.1 Add reporting enums to `schema/enums.ts` mirroring `enums/reporting.ts` (keep the
  `expectTypeOf` parity test green)
- [x] 2.2 Add `schema/reporting/report-schedule.ts` — `report_schedule` (`name`, `report_key`,
  `cron`, `recipients` **`text().array()`** — first array column, `format`, `params jsonb()`,
  `is_active`, `...auditColumns`, `...versionColumn`)
- [x] 2.3 Re-export `schema/reporting/*` from `schema/index.ts`; `pnpm db:generate` (creates the
  `report_schedule` migration)
- [x] 2.4 Author the **MV custom migration** (`drizzle-kit generate --custom
  --name=reporting_materialized_views`) — `CREATE MATERIALIZED VIEW` for `mv_stock_valuation`,
  `mv_sales_daily`, `mv_cogs_monthly`, each with a **UNIQUE index** (for `REFRESH … CONCURRENTLY`),
  using `--> statement-breakpoint`. **Sequence this migration after the M3/M5 migrations.**
- [x] 2.5 `pnpm db:migrate` against a DB that already has M3/M5 tables; confirm the three MVs +
  their unique indexes exist

## 3. Config, deps & infra — `apps/api/src`

- [x] 3.1 Add deps to `apps/api`: `nodemailer` (+ types), `exceljs` (shared with the M5
  proposal — dedupe to one version)
- [x] 3.2 Add `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` to
  `config/env.schema.ts` (validated at boot)
- [x] 3.3 `MailService` wrapping `nodemailer.createTransport(SMTP_* env)` + an `EmailWorker`
  (`BaseWorker` subclass — the `email` queue's first consumer)

## 4. Nest module — `apps/api/src/reporting`

- [x] 4.1 `ReportService` — per-`report_key` SQL builders over the MVs via
  `currentExecutor(this.db).execute(sql\`…\`)`; returns `{ columns, rows, totals }`
- [x] 4.2 `DashboardService` — compose panels, applying one `(dimension, value)` set across
  every panel builder
- [x] 4.3 `ExportService` + `ExportWorker` — async render (Excel `exceljs` / CSV native / PDF
  `PdfService.renderHtml`), `StorageService.put` + `getSignedUrl`; `GET /exports/{job_id}` →
  `{ status, file_url? }`; emit `ReportGenerated`
- [x] 4.4 `ReportScheduleService` — schedule CRUD; **upsert/remove a BullMQ repeatable job**
  (`repeat: { pattern: cron }`) on create/update/activate/delete/deactivate; `run-now` enqueues
  a one-off (202)
- [x] 4.5 `DigestWorker` (`BaseWorker`) — render + store + enqueue an email job; on send-failure
  exhaustion emit an in-app alert; emit `ScheduledReportSent`
- [x] 4.6 `MvRefreshSubscriber` (`@OnEvent` for `GoodsReceiptPosted`/`GoodsIssued`/
  `StockAdjusted`/`BackflushPosted`/`InvoiceIssued`/`PaymentReceived`, after-commit) enqueues a
  **debounced** `mv-refresh` job; `MvRefreshWorker` runs the targeted
  `REFRESH MATERIALIZED VIEW CONCURRENTLY` (+ a scheduled fallback refresh)
- [x] 4.7 ts-rest `ReportingController`(s) — in-handler `assertPermissions(user,
  "report.<group>.view")`; **cost/profit also assert `inventory.cost.view` → 403**;
  `ReportingModule` wired into `app.module.ts`
- [x] 4.8 Verify: `pnpm build && pnpm typecheck && pnpm lint` green; API boots and maps the new
  `/api/v1` reporting routes

## 5. Tests (spec §6.7)

- [x] 5.1 Clicking "this month" on the sales panel re-filters Top-Products and Sales-by-Customer
  to the same window (one dimension across panels)
- [x] 5.2 `cost.valuation` total equals `Σ mv_stock_valuation`, matching M3 stock cards
  item-by-item
- [x] 5.3 A `0 8 * * 1` schedule emails recipients a summary with attachment every Monday 08:00;
  a send failure retries and surfaces an in-app alert
- [x] 5.4 A user with `report.sales.view` but not `inventory.cost.view` opens sales reports but
  gets 403 on cost/profit reports

## 6. Verification

- [x] 6.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
- [ ] 6.2 `pnpm db:generate` clean; `pnpm db:migrate` runs cleanly against a DB with M3/M5
  applied (creates `report_schedule` + the three MVs with unique indexes)
- [ ] 6.3 Boot `pnpm dev` and drive: `GET /reports/{key}` for each group (403 on cost/profit
  without `inventory.cost.view`) → `GET /dashboards/{key}` cross-filter → `POST
  /reports/{key}/export` → `GET /exports/{job_id}` signed URL → create a `0 8 * * 1` schedule +
  `run-now` (email sent via SMTP) → emit a stock/sales event and confirm the targeted MV refresh
