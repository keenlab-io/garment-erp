## ADDED Requirements

### Requirement: Operational inventory reports
The system SHALL provide stock-card, valuation, low-stock, and dead-stock reports, with cost and
valuation columns masked for users lacking `inventory.cost.view`.

#### Scenario: Valuation report masks cost without permission
- **WHEN** a user without `inventory.cost.view` opens the valuation report
- **THEN** cost/valuation figures are masked while quantities remain visible

### Requirement: Barcode label printing
The system SHALL let users select items/lots and enqueue a barcode-label print job, surfaced via
a job toast and a completion notification with the file.

#### Scenario: Print barcode labels as a job
- **WHEN** items are selected for barcode printing
- **THEN** a label job is enqueued with a job toast and the finished labels are provided on completion
