## ADDED Requirements

### Requirement: Event-driven materialized-view refresh
On the relevant domain events — `GoodsReceiptPosted`, `GoodsIssued`, `StockAdjusted`,
`BackflushPosted` (inventory) and `InvoiceIssued`, `PaymentReceived` (sales) — the system SHALL
enqueue a refresh that runs a **targeted** `REFRESH MATERIALIZED VIEW CONCURRENTLY` for only
the affected view. Refreshes SHALL be **debounced** so bursts of events coalesce rather than
thrash the database.

#### Scenario: A stock event refreshes the stock views
- **WHEN** a `GoodsReceiptPosted` event is observed
- **THEN** a debounced refresh of the stock valuation view is enqueued and runs concurrently

#### Scenario: A sales event refreshes the sales view
- **WHEN** an `InvoiceIssued` event is observed
- **THEN** a debounced refresh of `mv_sales_daily` is enqueued

#### Scenario: Bursts of events coalesce
- **WHEN** many refresh-triggering events arrive in quick succession for the same view
- **THEN** they collapse into a single refresh rather than one refresh per event
