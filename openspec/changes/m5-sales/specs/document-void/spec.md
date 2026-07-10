## ADDED Requirements

### Requirement: Void a document with a mandatory reason
`POST /api/v1/invoices/{id}/void` `{ reason }` (perm `sales.document.void`) SHALL set the
document status to **VOID** without deleting it, requiring a non-blank reason (blank → 422),
and SHALL write an append-only `audit_log` row with `action = VOID` and the reason.

#### Scenario: Valid void records status and audit
- **WHEN** an invoice is voided with a non-blank reason
- **THEN** its status becomes VOID, the row is retained, and an `audit_log` row with `action = VOID` and the reason is written

#### Scenario: Void without a reason is rejected
- **WHEN** a void is requested with a blank reason
- **THEN** the request is rejected with 422

### Requirement: Void is blocked once a receipt exists
A void SHALL be rejected with **409** if a `receipt_tax_invoice` has already been issued for
the document.

#### Scenario: Void after a receipt exists conflicts
- **WHEN** a void is requested for an invoice that already has a receipt/tax-invoice
- **THEN** the request is rejected with 409 STATE_CONFLICT

### Requirement: Void compensates a prior stock deduction
If the voided invoice previously triggered a stock OUT, the void SHALL emit `DocumentVoided`
so downstream inventory posts a compensating stock IN.

#### Scenario: Voiding an issued inventory-linked invoice compensates stock
- **WHEN** an invoice that triggered a stock OUT is voided
- **THEN** a `DocumentVoided` event is emitted for the compensating stock IN
