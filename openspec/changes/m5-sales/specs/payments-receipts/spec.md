## ADDED Requirements

### Requirement: Record a payment
`POST /api/v1/invoices/{id}/payments` (perm `sales.payment.record`) SHALL record a `payment`
(`method`, `promptpay_ref`), increase the invoice's `amount_paid`, and set the invoice status:
`PAID` when `amount_paid = grand_total − wht`, otherwise `PARTIALLY_PAID`. It SHALL emit
`PaymentReceived`.

#### Scenario: Full payment marks the invoice paid
- **WHEN** a payment brings `amount_paid` to `grand_total − wht`
- **THEN** the invoice status becomes PAID
- **AND** a `PaymentReceived` event is emitted

#### Scenario: Partial payment marks the invoice partially paid
- **WHEN** a payment leaves `amount_paid` above zero but below `grand_total − wht`
- **THEN** the invoice status becomes PARTIALLY_PAID

### Requirement: Receipt / tax-invoice issuance
On payment the system SHALL issue a `receipt_tax_invoice` from the separate receipt sequence —
a `RECEIPT` for non-VAT documents and a `TAX_INVOICE` / `RECEIPT_TAX_INVOICE` for VAT
documents.

#### Scenario: Non-VAT payment issues a plain receipt
- **WHEN** a payment is recorded against a non-VAT invoice
- **THEN** a `receipt_tax_invoice` of type `RECEIPT` is issued with a number from the receipt sequence

#### Scenario: VAT payment issues a tax invoice
- **WHEN** a payment is recorded against a VAT invoice
- **THEN** a `receipt_tax_invoice` of a tax-invoice type is issued
