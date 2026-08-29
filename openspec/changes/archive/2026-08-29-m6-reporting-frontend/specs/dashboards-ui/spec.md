## ADDED Requirements

### Requirement: Cross-filtered dashboards
Dashboards SHALL apply a selection on any dimension consistently across every panel, showing the
active slice in an active-filter chip rail above the panels; filter state is encoded in the URL
(shareable) and Clear resets it.

#### Scenario: One selection re-filters all panels
- **WHEN** a user clicks a dimension (e.g. "this month" or a product slice)
- **THEN** every panel re-filters to that selection and the active-filter chip rail shows what is applied

#### Scenario: Filter state is shareable via URL
- **WHEN** a filtered dashboard's URL is shared or reloaded
- **THEN** the same filter selection is restored

### Requirement: KPI cards and cost/profit masking
KPI cards SHALL show a tabular number, a delta with ▲/▼ (not color-only), and a sparkline; charts
are themed from tokens. Cost and profit KPIs/panels SHALL be masked (lock + "requires cost
access") for users lacking `inventory.cost.view`.

#### Scenario: Delta is not conveyed by color alone
- **WHEN** a KPI shows a change
- **THEN** the delta uses a ▲/▼ indicator in addition to color

#### Scenario: Cost/profit masked without permission
- **WHEN** a user without `inventory.cost.view` opens a dashboard
- **THEN** cost/profit KPIs and panels are masked with a lock and an access note

### Requirement: Unified alerts glance
An alerts panel SHALL unify low-stock (M3), production delays (M4), and overdue invoices (M5) into
one actionable list linking to the source records.

#### Scenario: Owner sees all alert classes in one place
- **WHEN** the overview dashboard is opened
- **THEN** low-stock, delay, and overdue alerts appear together, each linking to its source record
