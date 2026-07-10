## ADDED Requirements

### Requirement: Read-only report engine
`GET /api/v1/reports/{report_key}?from=&to=&dimension=&value=&filters…` SHALL return a
tabular result `{ columns[], rows[], totals }` for the requested report, reading exclusively
from materialized views / read models. All report endpoints are **GET and read-only** — they
never mutate operational data.

#### Scenario: A report returns columns, rows, and totals
- **WHEN** a report is requested with a date range and filters
- **THEN** the response contains `columns`, `rows`, and `totals` computed from the read models

### Requirement: Full report catalog
The system SHALL expose the report catalog across five groups: **Inventory**
(`stock.balance`, `stock.movement`, `stock.low`, `stock.dead`), **Sales** (`sales.overview`,
`sales.top_products`, `sales.by_customer`, `sales.doc_status`), **Cost** (`cost.cogs_monthly`,
`cost.variance`, `cost.valuation`), **Profit** (`profit.margin_by_item`, `profit.by_order`,
`profit.net_estimate`), and **Tax** (`tax.pp30`, `tax.aging`).

#### Scenario: A catalogued report key resolves to its builder
- **WHEN** a request names a report key in the catalog
- **THEN** the corresponding report is produced

#### Scenario: An unknown report key is rejected
- **WHEN** a request names a report key that is not in the catalog
- **THEN** the request is rejected with 404

### Requirement: Report RBAC with cost/profit dual-permission
Each report SHALL be gated by its group permission `report.<group>.view`. **Cost and profit**
reports SHALL additionally require `inventory.cost.view`; a user lacking it receives **403**
even if they hold the group permission.

#### Scenario: Group permission grants access to that group
- **WHEN** a user with `report.sales.view` opens a sales report
- **THEN** the report is returned

#### Scenario: Cost/profit requires the cost-view permission
- **WHEN** a user with `report.sales.view` but not `inventory.cost.view` opens a cost or profit report
- **THEN** the request is rejected with 403 FORBIDDEN
