## ADDED Requirements

### Requirement: Items list and tabbed item detail
The system SHALL provide an items list (Data Table with type filter chips, low-stock health
chip, barcode column, bulk print/export) and a tabbed item detail (Overview · SKUs · Lots ·
Stock Card · BOM), gated by `inventory.product.create`/read.

#### Scenario: Browse items with health signalling
- **WHEN** the items list is opened
- **THEN** items show a stock-health chip and type filter chips, and rows open a tabbed detail

### Requirement: Immutable stock card
The Stock Card SHALL render movement rows with a running balance (Date · Ref · In · Out ·
Balance · Unit cost), append-only and visibly immutable — no edit affordances; corrections
appear as new compensating rows, never edits.

#### Scenario: Stock card reads as an immutable ledger
- **WHEN** the Stock Card tab is opened
- **THEN** rows show a running balance with no edit actions, and a correction appears as a new row rather than an edited one

### Requirement: Cost figures masked without permission
Cost, unit-cost, and valuation figures SHALL be masked (`••••` + lock) for users lacking
`inventory.cost.view`, while on-hand quantities remain visible.

#### Scenario: Unauthorized user sees masked cost but visible quantity
- **WHEN** a user without `inventory.cost.view` opens an item
- **THEN** cost/valuation fields are masked while on-hand quantity is shown
