# M6 — Reporting & Analytics: Design

## Context

M6 is a read-only lens over M2–M5. It reuses the M0 foundation almost wholesale (queues,
`BaseWorker`, `PdfService`, `StorageService`, `EventBus` + `@OnEvent`, the `DB` token +
`currentExecutor`, the custom-SQL migration pattern, and all 7 `report.*`/`inventory.cost.view`
codes). What is genuinely new is *analytical plumbing*: three materialized views, the first
concrete background workers in the repo (export, digest, MV-refresh, email), the first
cron/repeatable jobs, and the first outbound email path.

Because the MVs read M3 (`stock_balance`, `stock_movement`) and M5 (`invoice`) tables that
don't exist until those modules are applied, **M6 is build-last** — its view migrations are
sequenced after M3/M5, and its event consumers stay dormant until M3/M5 emit.

`backend only`; the wireframes remain the visual source of truth for the later frontend
milestone.

## Goals / Non-Goals

**Goals:** the read-only report engine + full 5-group catalog; cross-filtered dashboards; the
three MVs + valuation reconciliation; event-driven MV refresh; async Excel/CSV/PDF exports
with signed URLs; scheduled cron digests emailed to recipients; RBAC (per-group + cost/profit
dual-permission).

**Non-Goals:** frontend; a read-replica connection (deferred — M6 reads MVs on the primary);
an in-app notification UI (digest-failure alerts are *emitted*, delivery deferred); real-time
streaming analytics; write-back / data entry of any kind.

## Decisions

### D1. Read from the primary; read-replica deferred
Only a single primary `DB` connection exists (`createDb` has no replica parameter; env has no
`DATABASE_REPLICA_URL`). M6 reads MVs on the primary via
`currentExecutor(this.db).execute(sql\`SELECT … FROM mv_…\`)`. Reading from a replica (the
spec's aspiration) is deferred behind a future `DATABASE_REPLICA_URL` + second provider; MVs
already isolate analytics from the OLTP write path, which is the material win.

### D2. Materialized views as hand-written custom migrations
drizzle-kit can't emit MVs, so author them as a custom SQL migration (the
`--> statement-breakpoint` pattern from `0001_audit_append_only.sql`, appended as the next
`NNNN_` tag + `_journal.json` entry):
- `mv_stock_valuation` — `SELECT item_id, warehouse_id, qty_on_hand, avg_cost,
  qty_on_hand*avg_cost AS value FROM stock_balance`.
- `mv_sales_daily` — `SELECT issue_date::date AS d, customer_id, sum(subtotal) AS sales,
  sum(vat_amount) AS vat FROM invoice WHERE status <> 'VOID' GROUP BY 1,2`.
- `mv_cogs_monthly` — `SELECT date_trunc('month', at) AS m, sum(qty*unit_cost) AS cogs FROM
  stock_movement WHERE direction='OUT' AND ref_type IN ('GOODS_ISSUE','BACKFLUSH') GROUP BY 1`.
Each gets a **UNIQUE index** so `REFRESH MATERIALIZED VIEW CONCURRENTLY` is possible. The
migration is sequenced **after** the M3/M5 migrations that create its source tables.

### D3. `report_schedule` — the only write table
`schema/reporting/report-schedule.ts`: `name`, `report_key`, `cron`, `recipients`
(`text().array()` — the first array column in the schema), `format`, `params` (`jsonb()`),
`is_active`, plus `auditColumns` + `versionColumn`.

### D4. Report-catalog engine + full catalog
`GET /api/v1/reports/{report_key}?from=&to=&dimension=&value=&filters…` → `{ columns[], rows[],
totals }`. `report_key` routes to a per-report SQL builder. The catalog (all 5 groups):
- **Inventory:** `stock.balance`, `stock.movement`, `stock.low`, `stock.dead?months=`.
- **Sales:** `sales.overview`, `sales.top_products`, `sales.by_customer`, `sales.doc_status`.
- **Cost:** `cost.cogs_monthly`, `cost.variance`, `cost.valuation`.
- **Profit:** `profit.margin_by_item`, `profit.by_order`, `profit.net_estimate`.
- **Tax:** `tax.pp30`, `tax.aging`.

### D5. RBAC — per-group + dual-permission for cost/profit
Each endpoint calls `assertPermissions(user, "report.<group>.view")` in-handler.
**Cost and profit** reports additionally require `inventory.cost.view` → **403 FORBIDDEN**
otherwise. Both codes already exist in the catalog.

### D6. Cross-filtered dashboards
`GET /api/v1/dashboards/{key}` → `{ panels: [{ key, data }] }`. A single `(dimension, value)`
param set is applied consistently to **every** panel builder so all panels reflect the same
window (e.g. `?dimension=month&value=2026-03` re-filters Top-Products and Sales-by-Customer
together).

### D7. Async exports with signed URLs
`POST /api/v1/reports/{report_key}/export { format, params }` → **202 `{ job_id }`**; the job
runs on the `pdf`/`default` queue: Excel via `exceljs`, CSV via native streaming, PDF via
`PdfService.renderHtml`. The result buffer is stored with `StorageService.put(key, buf)` and
`GET /api/v1/exports/{job_id}` returns `{ status, file_url? }` where `file_url` is a
`StorageService.getSignedUrl(key)` presigned link. Emits `ReportGenerated`. Large result sets
stream rather than buffer whole.

### D8. Scheduled digests — cron via BullMQ repeatable
Each active `report_schedule` drives a BullMQ **repeatable** job keyed by its id, using
`repeat: { pattern: <cron> }` (no `@nestjs/schedule` dependency). The repeatable job is
**upserted on create/update/activate and removed on delete/deactivate**, so the schedule table
is the source of truth. `POST /report-schedules/{id}/run-now` enqueues a one-off → 202. The
`DigestWorker` renders the report, stores it, and enqueues an email job; a send failure retries
under `DEFAULT_JOB_OPTIONS` (5 attempts, exponential backoff) and, on exhaustion, **emits an
in-app alert event**. Emits `ScheduledReportSent`.

### D9. Email transport — nodemailer / SMTP
The `email` queue currently has no consumer. Add a `MailService` wrapping
`nodemailer.createTransport(SMTP_* env)` and an `EmailWorker` (the queue's first consumer) that
sends `{ to: recipients, subject, attachments: [rendered report] }`. New env
`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`, validated in `env.schema.ts`.

### D10. Event-driven, debounced MV refresh
`@OnEvent` subscribers (the `audit.subscriber.ts` template) consume
`GoodsReceiptPosted`/`GoodsIssued`/`StockAdjusted`/`BackflushPosted` (M3) and
`InvoiceIssued`/`PaymentReceived` (M5). On the **after-commit** path they enqueue a
**debounced** job on the `mv-refresh` queue that runs the targeted
`REFRESH MATERIALIZED VIEW CONCURRENTLY` for the affected view only (stock events →
`mv_stock_valuation`/`mv_cogs_monthly`; sales events → `mv_sales_daily`). Debounce coalesces
bursts so refreshes don't thrash. **Dormant until M3/M5 emit these events**; a scheduled
fallback refresh keeps views fresh in the meantime.

### D11. Valuation reconciliation invariant
`cost.valuation` total SHALL equal `Σ mv_stock_valuation.value`, reconciling to each item's M3
stock card item-by-item — the correctness anchor for the whole cost/profit layer.

### D12. First concrete workers must be idempotent
The export, digest, MV-refresh, and email workers are the repo's first `BaseWorker` subclasses.
Per the `BaseWorker` contract (after-commit dispatch is not crash-safe), each must be
idempotent on `(event, correlation_id)` / job id — safe under redelivery.

## Risks / Trade-offs

- **Build-last coupling:** the MV migrations fail if applied before M3/M5. Mitigated by
  explicit sequencing (migration tag after M3/M5) and documented apply order.
- **Refresh thrashing** under high write volume — mitigated by debouncing on the `mv-refresh`
  queue + `CONCURRENTLY` (non-blocking) refresh; a scheduled fallback bounds staleness.
- **Stale reads:** MVs lag the OLTP by a refresh cycle — acceptable for analytics and called
  out; sub-second freshness is a non-goal.
- **Dormant consumers:** M3/M5 events don't exist yet — the `@OnEvent` handlers register but
  never fire until those modules land (EventBus tolerates zero emitters).
- **Email deliverability** depends on the operator's SMTP — retries + a failure alert bound the
  blast radius; provider-grade deliverability is out of scope.

## Migration Plan

Additive: one `report_schedule` table + three materialized views (+ their unique indexes). No
existing-table changes. **Apply order: M1 → M3 → M2 → M4 → M5 → M6.** The MV migration is the
last to run; the MV-refresh consumers activate as M3/M5 begin emitting.

## Open Questions

- In-app **alert** mechanism for digest failures (emit event now; notification table/UI
  deferred).
- Read-replica routing (`DATABASE_REPLICA_URL` + second provider) — deferred.
- Debounce window / scheduled fallback cadence for MV refresh.
- `cost.variance` (BOM vs actual) and `profit.net_estimate` formulas depend on M3/M4 cost data
  — final column math confirmed when those apply.
- `exceljs` dependency is shared with the M5 proposal — dedupe to one version once both apply.
