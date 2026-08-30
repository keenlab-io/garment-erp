## MODIFIED Requirements

### Requirement: Analytical materialized views
The system SHALL provide three materialized views as the read models for reporting:
`mv_stock_valuation` (per tenant/item/warehouse `qty_on_hand × avg_cost` value from
`stock_balance`), `mv_sales_daily` (daily sales and VAT per tenant and customer from
non-VOID `invoice` rows), and `mv_cogs_monthly` (monthly COGS per tenant from
`stock_movement` OUT rows of type GOODS_ISSUE/BACKFLUSH). Each view SHALL include
`tenant_id` in its SELECT and in its **unique index** (so
`REFRESH MATERIALIZED VIEW CONCURRENTLY` still works). Because **Postgres does not
support Row-Level Security on materialized views**, the `mv_*` relations MUST NOT be
readable by the runtime role: `SELECT` on them is revoked from `erp_app`, and the
reporting layer reads exclusively through the `security_barrier` wrapper views.

#### Scenario: Views hold all tenants but expose none directly
- **WHEN** the materialized views are refreshed
- **THEN** each MV row carries its `tenant_id`
- **AND** a direct `SELECT` from any `mv_*` relation as the runtime role fails with a permission error

#### Scenario: Views support concurrent refresh
- **WHEN** a materialized view is refreshed
- **THEN** the refresh can run `CONCURRENTLY` because the view's unique index (now including `tenant_id`) exists

### Requirement: Valuation reconciles to stock cards
The `cost.valuation` report total SHALL equal the sum of `v_stock_valuation.value` for
the reporting tenant, and that total SHALL reconcile to each of the tenant's items'
stock cards item-by-item. Reconciliation is a per-tenant property: one tenant's report
never includes another tenant's stock value.

#### Scenario: Valuation total matches the view sum and stock cards
- **WHEN** the `cost.valuation` report is produced for tenant A
- **THEN** its total equals `Σ v_stock_valuation.value` as seen in tenant A's scope
- **AND** the value reconciles to each of tenant A's items' stock cards item-by-item

## ADDED Requirements

### Requirement: Security-barrier views are the only read path over the MVs
Each materialized view SHALL be wrapped by a `WITH (security_barrier)` view —
`v_stock_valuation`, `v_sales_daily`, `v_cogs_monthly` — that filters
`tenant_id = current_setting('app.tenant_id', true)::uuid`. `erp_app` is granted
`SELECT` on the `v_*` views only. `security_barrier` prevents leaky-function predicate
pushdown from observing rows the filter excludes. Reporting repositories
(`apps/api/src/reporting/`) MUST reference only the `v_*` relations.

#### Scenario: Wrapper view filters by the GUC
- **WHEN** a reporting query selects from `v_sales_daily` inside tenant B's transaction
- **THEN** only rows whose `tenant_id` equals tenant B's id are returned, though the underlying MV holds every tenant's rows

#### Scenario: No tenant in scope reads nothing
- **WHEN** `v_stock_valuation` is queried in a transaction where `app.tenant_id` is unset
- **THEN** zero rows are returned
