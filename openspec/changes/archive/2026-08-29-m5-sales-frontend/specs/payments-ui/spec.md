## ADDED Requirements

### Requirement: Record payment and issue receipt
Recording a payment SHALL offer full or partial; a full payment issues a Receipt/Tax Invoice and
sets status PAID, a partial payment sets PARTIALLY_PAID with the remainder tracked.

#### Scenario: Full payment issues a receipt
- **WHEN** a full payment is recorded against an invoice
- **THEN** a receipt/tax invoice is issued and the status becomes PAID

#### Scenario: Partial payment tracks the remainder
- **WHEN** a partial payment is recorded
- **THEN** the status becomes PARTIALLY_PAID and the remaining balance is tracked

### Requirement: Guarded void blocked after a receipt
Void SHALL use the guarded confirm dialog (permission + reason) and be blocked with an
explanatory dialog when a receipt already exists — never a silent failure; void never deletes.

#### Scenario: Void after a receipt is explained, not silent
- **WHEN** a user attempts to void a document that already has a receipt
- **THEN** an explanatory dialog states why it is blocked rather than failing silently

#### Scenario: Valid void requires a reason
- **WHEN** a document without a receipt is voided
- **THEN** the confirm dialog captures a reason and states the consequence before voiding
