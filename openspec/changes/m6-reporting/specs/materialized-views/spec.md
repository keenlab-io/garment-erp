## ADDED Requirements

### Requirement: Analytical materialized views
The system SHALL provide three materialized views as the read models for reporting:
`mv_stock_valuation` (per item/warehouse `qty_on_hand × avg_cost` value from `stock_balance`),
`mv_sales_daily` (daily sales and VAT per customer from non-VOID `invoice` rows), and
`mv_cogs_monthly` (monthly COGS from `stock_movement` OUT rows of type GOODS_ISSUE/BACKFLUSH).
Each view SHALL carry a **unique index** so it can be refreshed with
`REFRESH MATERIALIZED VIEW CONCURRENTLY`.

#### Scenario: Views exist as the reporting read models
- **WHEN** the reporting layer serves inventory, sales, or cost reports
- **THEN** it reads from `mv_stock_valuation`, `mv_sales_daily`, and `mv_cogs_monthly`

#### Scenario: Views support concurrent refresh
- **WHEN** a materialized view is refreshed
- **THEN** the refresh can run `CONCURRENTLY` because the view has a unique index

### Requirement: Valuation reconciles to stock cards
The `cost.valuation` report total SHALL equal the sum of `mv_stock_valuation.value`, and that
total SHALL reconcile to each item's stock card item-by-item.

#### Scenario: Valuation total matches the view sum and stock cards
- **WHEN** the `cost.valuation` report is produced
- **THEN** its total equals `Σ mv_stock_valuation.value`
- **AND** the value reconciles to each item's stock card item-by-item
