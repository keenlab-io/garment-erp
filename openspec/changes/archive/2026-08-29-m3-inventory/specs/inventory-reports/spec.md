## ADDED Requirements

### Requirement: Operational inventory reports
The system SHALL provide read-only reports over the ledger and balance cache:
`GET /api/v1/reports/stock-card?item_id=&warehouse_id=&from=&to=` (opening, movements,
closing), `/valuation?as_of=`, `/low-stock`, and `/dead-stock?months=`. Cost-bearing reports
(valuation, and cost columns generally) MUST require `inventory.cost.view`.

#### Scenario: Stock card returns opening, movements, and closing
- **WHEN** a stock card is requested for an item/warehouse over a date range
- **THEN** the response returns the opening balance, the movements in range, and the closing balance

#### Scenario: Valuation requires the cost permission
- **WHEN** a user lacking `inventory.cost.view` requests the valuation report
- **THEN** the request is rejected with 403 FORBIDDEN

#### Scenario: Valuation reconciles to stock cards
- **WHEN** the valuation report is generated
- **THEN** each item's value equals `qty_on_hand × avg_cost` and reconciles to that item's stock card

### Requirement: Low-stock signalling
When a posting drops an item's `qty_on_hand` below its `min_stock`, the system SHALL emit
`LowStockReached { item_id, on_hand, min }` (for asynchronous notification consumers).

#### Scenario: Crossing the minimum emits an event
- **WHEN** a movement posts that leaves `qty_on_hand` below the item's `min_stock`
- **THEN** a `LowStockReached` event is emitted with the item, on-hand, and minimum
