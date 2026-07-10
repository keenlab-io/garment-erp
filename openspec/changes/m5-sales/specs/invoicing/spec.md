## ADDED Requirements

### Requirement: Invoice creation and numbering
`POST /api/v1/invoices` (perm `sales.invoice.create`) SHALL create an `invoice` with a unique
`doc_no` from the `INVOICE` sequence, an optional `quotation_id`, `wht_rate`, and
server-computed totals from its `doc_line` rows.

#### Scenario: Invoice receives a unique document number
- **WHEN** an invoice is created
- **THEN** it receives a unique `doc_no` from the `INVOICE` sequence

### Requirement: Invoice lifecycle
An invoice SHALL move `DRAFT → ISSUED → PARTIALLY_PAID → PAID`, with `OVERDUE` and `VOID`
branches, and no backward transitions. It starts `DRAFT`.

#### Scenario: New invoice starts as draft
- **WHEN** an invoice is created
- **THEN** its status is DRAFT

### Requirement: Issue an invoice
`POST /api/v1/invoices/{id}/issue` (perm `sales.invoice.create`) SHALL set the invoice to
ISSUED. If the invoice is inventory-linked, it SHALL emit `InvoiceIssued` (and
`DeliveryNoteIssued` when a delivery note is produced) so downstream inventory can post an
optional stock OUT.

#### Scenario: Issuing an invoice emits the inventory event
- **WHEN** an inventory-linked invoice is issued
- **THEN** the invoice becomes ISSUED and an `InvoiceIssued` event is emitted for the optional stock OUT

### Requirement: Partial billing ceiling
When multiple invoices are raised against one quotation, the system SHALL enforce that the sum
of those invoices' subtotals does not exceed the quotation's subtotal, rejecting an invoice
that would exceed it with **422**.

#### Scenario: Invoices within the quotation subtotal are allowed
- **WHEN** invoices are raised against a quotation and their combined subtotal stays within the quotation subtotal
- **THEN** each invoice is accepted

#### Scenario: Exceeding the quotation subtotal is rejected
- **WHEN** a second invoice against a quotation would push the combined subtotals above the quotation subtotal
- **THEN** that invoice is rejected with 422
