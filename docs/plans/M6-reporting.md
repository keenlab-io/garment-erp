# M6 — Reporting & Analytics

Spec: [`../BACKEND_SPEC_M1-M6.md`](../BACKEND_SPEC_M1-M6.md) §6. Recipe & shared
primitives: [`README.md`](README.md), [`M0-foundation.md`](M0-foundation.md).

**Depends on:** M2–M5 (read models), M0 (queue for digests, pdf/storage for
exports). **Build last.**

Responsibilities: a read-only analytical layer over M2–M5 — inventory/sales/cost/
profit dashboards with cross-filtering, exports (Excel/CSV/PDF), and scheduled
email digests. Reads from materialized views to avoid impacting OLTP.

---

## 1. Contracts — `dto/reporting.ts`

- `GET /reports/{report_key}` (read-only; `from`/`to`/`dimension`/`value`/filters)
  → `{columns[], rows[], totals}`; RBAC `report.<group>.view` (+
  `inventory.cost.view` for cost/profit → 403 otherwise).
- `GET /dashboards/{key}` (cross-filtered) → `{panels:[{key,data}]}`.
- `POST /reports/{report_key}/export` `{format,params}` → 202 `jobAccepted`;
  `GET /exports/{job_id}` → `{status, file_url?}`.
- Report schedules (`report.schedule.manage`): `GET/POST/PUT/DELETE
  /report-schedules`, `POST /report-schedules/{id}/run-now` → 202.

Permissions (catalog): `report.inventory.view`, `report.sales.view`,
`report.cost.view`, `report.profit.view`, `report.tax.view`,
`report.schedule.manage`, plus `inventory.cost.view` for cost/profit.

---

## 2. DB schema — `packages/db/src/schema/reporting/`

No write tables except `report_schedule` (`report_key`, `cron`, `recipients
text[]`, `format`, `params jsonb`, `is_active`). The **materialized views** are
hand-written SQL migrations (drizzle-kit can't emit MVs):

- `mv_stock_valuation` (from `stock_balance`: `qty_on_hand*avg_cost AS value`)
- `mv_sales_daily` (from `invoice` where status ≠ VOID, grouped by day/customer)
- `mv_cogs_monthly` (from `stock_movement` OUT GOODS_ISSUE/BACKFLUSH, by month)

Generate an empty custom migration (`drizzle-kit generate --custom`) and write the
`CREATE MATERIALIZED VIEW` statements (with unique indexes to allow
`REFRESH ... CONCURRENTLY`).

---

## 3. Nest module — `apps/api/src/reporting/`

- All endpoints **GET, read-only**, RBAC-gated via `assertPermissions` (cost/profit
  also require `inventory.cost.view`).
- **Cross-filtering**: one param set (`?dimension=&value=`) applied consistently
  across every panel of a dashboard request so panels stay in sync.
- Valuation equals Σ `mv_stock_valuation`, reconciling to each item's M3 stock
  card.
- **Exports**: async BullMQ jobs (202 + `job_id`); large sets stream to Excel/CSV;
  PDF via the M0 shared renderer; result stored via `StorageService`, returned as a
  signed URL.
- **Scheduled digests**: one BullMQ **repeatable** job per active `report_schedule`
  (cron) renders + emails; failures retry with backoff + raise an in-app alert.
- **MV refresh**: consume `GoodsReceiptPosted`/`GoodsIssued`/`StockAdjusted`/
  `InvoiceIssued`/`PaymentReceived`/`BackflushPosted` (async) → targeted
  `REFRESH MATERIALIZED VIEW CONCURRENTLY` for the affected view (debounce via the
  `mv-refresh` queue to avoid thrashing).
- Emits `ReportGenerated`, `ScheduledReportSent`.

---

## 4. Tests (spec §6.7)

- Clicking "this month" on the sales panel re-filters Top-Products and
  Sales-by-Customer to the same window (one dimension across panels).
- `cost.valuation` total equals Σ `mv_stock_valuation`, matching M3 stock cards
  item-by-item.
- A `0 8 * * 1` schedule emails recipients a summary every Monday 08:00; a send
  failure retries and surfaces an in-app alert.
- A user with `report.sales.view` but not `inventory.cost.view` opens sales reports
  but gets 403 on cost/profit reports.

Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
