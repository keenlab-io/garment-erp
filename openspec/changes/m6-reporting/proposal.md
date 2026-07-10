# M6 — Reporting & Analytics

## Why

M1–M5 produce the operational data — people, stock, production, sales — but there is no way
to *see across* it. M6 is the read-only analytical layer: inventory / sales / cost / profit /
tax dashboards with cross-filtering, exports (Excel / CSV / PDF), and scheduled email
digests. It reads exclusively from **materialized views** so analytics never touch the OLTP
write path, and it is **built last** — its views read M3 (`stock_balance`/`stock_movement`)
and M5 (`invoice`) tables that only exist once those modules are applied.

M6 is almost entirely additive read-side work: one write table (`report_schedule`), three
materialized views, and a Nest module of GET endpoints + background workers. The 7 permission
codes it needs (`report.*` + `inventory.cost.view`) already sit in the M0 catalog.

## What Changes

- **New `reporting` capability set** (6 capabilities below) exposed under `/api/v1` via a new
  `reportingContract` on the root router.
- **New materialized views** — `mv_stock_valuation`, `mv_sales_daily`, `mv_cogs_monthly` —
  authored as hand-written custom SQL migrations (with unique indexes for
  `REFRESH … CONCURRENTLY`), sequenced **after** M3/M5.
- **New DB table** `report_schedule` (the only write table; first `text[]` array column in the
  schema).
- **New backend dependencies** `nodemailer` (digest email — first consumer of the `email`
  queue) and `exceljs` (Excel export); CSV via native streaming; PDF via the existing
  `PdfService`; new `SMTP_*` env vars.
- **First concrete background workers** in the repo — export, digest, MV-refresh, and email —
  all built on the existing (unused) `BaseWorker` + `pdf`/`email`/`mv-refresh`/`default`
  queues.
- **Cross-module (dormant until M3/M5):** `@OnEvent` consumers for
  `GoodsReceiptPosted`/`GoodsIssued`/`StockAdjusted`/`BackflushPosted`/`InvoiceIssued`/
  `PaymentReceived` trigger targeted, debounced MV refreshes.

## Capabilities

New:
1. **report-catalog** — the `GET /reports/{report_key}` engine, the full 5-group report
   catalog, and RBAC (per-group + the cost/profit dual-permission rule).
2. **dashboards** — `GET /dashboards/{key}` with one filter set cross-applied to every panel.
3. **materialized-views** — the 3 MVs + the valuation-reconciliation invariant.
4. **mv-refresh** — event-driven, debounced targeted `REFRESH MATERIALIZED VIEW CONCURRENTLY`.
5. **report-export** — async Excel/CSV/PDF export jobs with signed-URL delivery.
6. **report-schedules** — `report_schedule` CRUD + run-now + the cron digest engine that
   renders and emails recipients.

## Impact

- **Affected specs:** 6 new capabilities under the `reporting` module.
- **Affected code:** `packages/contracts/src` (`enums/reporting.ts`, `dto/reporting.ts`, root
  contract), `packages/db/src` (`schema/reporting/report-schedule.ts`, MV custom migrations,
  barrel), `apps/api/src/reporting/*` (new module + workers), `apps/api/src/config`
  (`SMTP_*`).
- **Depends on:** M0 (queue, pdf, storage, events, `DB`/`currentExecutor`, permission catalog)
  and **M2–M5 read models** — the MVs read M3/M5 tables, so **M6 applies last**. M1 supplies
  the permission resolver.
- **Migrations:** additive (one `report_schedule` table + three materialized views). No
  changes to existing tables. MV migrations must run **after** the M3/M5 migrations that
  create their source tables.
