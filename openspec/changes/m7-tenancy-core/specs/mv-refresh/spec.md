## MODIFIED Requirements

### Requirement: Event-driven materialized-view refresh
On the relevant domain events — `GoodsReceiptPosted`, `GoodsIssued`, `StockAdjusted`,
`BackflushPosted` (inventory) and `InvoiceIssued`, `PaymentReceived` (sales) — the
system SHALL enqueue a refresh that runs a **targeted**
`REFRESH MATERIALIZED VIEW CONCURRENTLY` for only the affected view. Refreshes SHALL be
**debounced** with keys of `(tenantId, view)` — sourced from the event's tenant — so one
tenant's burst neither delays nor absorbs another tenant's refresh signal. Because the
runtime role `erp_app` neither owns the MVs nor sees the RLS-protected source rows, the
refresh itself SHALL execute with owner rights via the `reporting.refresh_mv(view_name)`
`SECURITY DEFINER` function (owned by `erp_owner`, hard-coded allowlist of the three
view names) — a worker running as `erp_app` calling `REFRESH` directly would either fail
or materialize an empty view. The fallback sweep (`MV_REFRESH_FALLBACK_MS`) refreshes
each view once per tick; the rebuilt MVs hold all tenants' rows in one relation.

#### Scenario: A stock event refreshes the stock views
- **WHEN** a `GoodsReceiptPosted` event is observed in tenant A
- **THEN** a debounced refresh keyed `(A, mv_stock_valuation)` is enqueued and runs via `reporting.refresh_mv`

#### Scenario: A sales event refreshes the sales view
- **WHEN** an `InvoiceIssued` event is observed
- **THEN** a debounced refresh of `mv_sales_daily` is enqueued under that tenant's debounce key

#### Scenario: Bursts of events coalesce per tenant
- **WHEN** many refresh-triggering events arrive in quick succession for the same view within one tenant
- **THEN** they collapse into a single refresh rather than one refresh per event
- **AND** a lone event in another tenant during the same window still triggers that tenant's refresh on its own schedule

#### Scenario: Refresh runs with owner rights only through the allowlisted function
- **WHEN** the refresh worker executes `SELECT reporting.refresh_mv('mv_sales_daily')`
- **THEN** the refresh succeeds despite `erp_app` owning nothing
- **AND** calling the function with a name outside the three-view allowlist raises an error
