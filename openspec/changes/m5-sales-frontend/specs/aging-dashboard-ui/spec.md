## ADDED Requirements

### Requirement: AR aging dashboard
The system SHALL provide an accounts-receivable aging view grouping outstanding balances by
bucket (current / 1-30 / 31-60 / 61-90 / 90+), drillable to the underlying documents.

#### Scenario: Aging is shown by bucket
- **WHEN** the aging dashboard is opened
- **THEN** outstanding balances are grouped into aging buckets

#### Scenario: Drill from a bucket to documents
- **WHEN** an aging bucket is selected
- **THEN** the underlying overdue documents are listed
