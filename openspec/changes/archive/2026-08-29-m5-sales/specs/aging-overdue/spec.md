## ADDED Requirements

### Requirement: Accounts-receivable aging report
`GET /api/v1/reports/aging` SHALL return outstanding invoice balances bucketed by age
(current, 1-30, 31-60, 61-90, 90+ days past due) for the AR aging view.

#### Scenario: Aging report buckets outstanding balances
- **WHEN** the aging report is requested
- **THEN** outstanding invoice balances are returned grouped into current / 1-30 / 31-60 / 61-90 / 90+ buckets

### Requirement: Overdue detection sweep
A periodic sweep SHALL flip invoices whose `due_date` has passed and that are not PAID to
**OVERDUE**, emitting `InvoiceOverdue` for each newly overdue invoice.

#### Scenario: A past-due unpaid invoice becomes overdue
- **WHEN** the sweep runs and an unpaid invoice's `due_date` is in the past
- **THEN** the invoice status becomes OVERDUE and an `InvoiceOverdue` event is emitted

#### Scenario: A paid invoice is not marked overdue
- **WHEN** the sweep runs and an invoice past its `due_date` is already PAID
- **THEN** it is not marked OVERDUE
