## ADDED Requirements

### Requirement: Optional stock issue on sales issue
The system SHALL consume `InvoiceIssued` and `DeliveryNoteIssued` (emitted by M5) and, for an
inventory-linked document, post a stock `OUT` movement for each stocked line at current cost in
the emitter's transaction, then let the ledger reflect the reduction. The consumer is
**dormant until M5 is applied** (no emitter exists before then).

#### Scenario: An issued sales document posts a stock OUT
- **WHEN** an inventory-linked `InvoiceIssued` (or `DeliveryNoteIssued`) event is consumed
- **THEN** a stock `OUT` movement is posted for each stocked line at current cost, reducing `stock_balance`

#### Scenario: Non-inventory documents post nothing
- **WHEN** an `InvoiceIssued` event for a document with no stocked lines is consumed
- **THEN** no stock movement is posted

### Requirement: Compensating stock return on void
The system SHALL consume `DocumentVoided` (emitted by M5) and, when the voided document had
previously posted a stock `OUT`, post a compensating `IN` movement that reverses it — never
deleting the original ledger rows.

#### Scenario: Voiding a stock-issuing document returns the stock
- **WHEN** a `DocumentVoided` event is consumed for a document that had posted a stock OUT
- **THEN** a compensating `IN` movement reversing that OUT is posted and the original OUT rows are retained

### Requirement: Sales-driven stock movements are idempotent
These consumers SHALL be idempotent on `(event, correlation_id)`: a redelivered
`InvoiceIssued` / `DeliveryNoteIssued` / `DocumentVoided` MUST NOT post its movement twice.

#### Scenario: Duplicate delivery does not double-post
- **WHEN** the same sales event is delivered more than once
- **THEN** the corresponding stock movement is posted exactly once and later deliveries are no-ops
