## ADDED Requirements

### Requirement: Quotation creation and numbering
`POST /api/v1/quotations` (perm `sales.quotation.manage`) SHALL create a `quotation` with a
unique `doc_no` issued by `SequenceService` — the `QV` sequence for VAT quotations and the
`QNV` sequence for non-VAT quotations — with server-computed totals from its `doc_line` rows.

#### Scenario: VAT quotation is numbered from the QV sequence
- **WHEN** a VAT quotation is created
- **THEN** it receives a unique `doc_no` from the `QV` sequence

#### Scenario: Non-VAT quotation is numbered from the QNV sequence
- **WHEN** a non-VAT quotation is created
- **THEN** it receives a unique `doc_no` from the `QNV` sequence

### Requirement: Quotation lifecycle
A quotation SHALL move `DRAFT → SENT → APPROVED → CONVERTED`, with `EXPIRED`, `REJECTED`, and
`VOID` branches, via `POST /api/v1/quotations/{id}/send|approve|reject`. It starts `DRAFT`.
On approval the system SHALL emit `QuotationApproved` for downstream (audit/UI) consumers.

#### Scenario: Quotation advances through its states
- **WHEN** a DRAFT quotation is sent and then approved
- **THEN** its status becomes SENT and then APPROVED
- **AND** a `QuotationApproved` event is emitted on approval

#### Scenario: A quotation may be rejected
- **WHEN** a SENT quotation is rejected
- **THEN** its status becomes REJECTED

### Requirement: One-click convert to invoice
`POST /api/v1/quotations/{id}/convert` (perm `sales.invoice.create`) SHALL, for an **APPROVED**
quotation, create a new invoice copying the quotation's lines and prices and flip the
quotation to **CONVERTED** in a single transaction. A quotation that is already CONVERTED (or
not APPROVED) MUST be rejected with **409**. Replaying the same `Idempotency-Key` SHALL return
the originally created invoice.

#### Scenario: Convert an approved quotation
- **WHEN** an APPROVED quotation is converted
- **THEN** a new invoice is created with identical lines and prices
- **AND** the quotation status becomes CONVERTED

#### Scenario: Re-converting is rejected
- **WHEN** a CONVERTED quotation is converted again
- **THEN** the request is rejected with 409 STATE_CONFLICT

#### Scenario: Idempotent replay returns the same invoice
- **WHEN** the same convert request is retried with the same `Idempotency-Key`
- **THEN** the originally created invoice is returned rather than a second invoice
