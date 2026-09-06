## ADDED Requirements

### Requirement: Vendor-side invoices are structurally separate from the ERP's own
`subscription_invoice` SHALL live in `schema/platform/`, be `TENANT_EXEMPT` (no
`tenant_id` RLS; listed in M7's parity allowlist), and share no table, sequence, or
state machine with the tenant-facing M5 `invoice` in `apps/api/src/sales/`. Numbers are
`SINV-{YYYY}-{seq}` from a dedicated control-plane Postgres sequence — never from the
tenant-scoped `document_sequence`. All amounts are money strings, VAT-exclusive,
computed with `@erp/utils` decimal helpers.

#### Scenario: Vendor billing is invisible inside the ERP
- **WHEN** a tenant user queries their sales module
- **THEN** no subscription invoice appears anywhere in tenant data, and tenant invoice numbering is unaffected

### Requirement: Invoice lines carry the fee, setup, seats, and up-front discount explicitly
An issued invoice SHALL be composed of typed lines (`ANNUAL_FEE | SETUP_FEE |
EXTRA_SEATS | UPFRONT_DISCOUNT`). The `SETUP_FEE` line appears only on a subscription's
first invoice; the `UPFRONT_DISCOUNT` line (default `annual_fee × 2/12`, admin-editable)
implements the GTM's "discount worth about two months for paying the year up front" and
MUST appear as its own negative line so the customer's paperwork shows list price and
discount separately.

#### Scenario: First-year Factory invoice matches the GTM shape
- **WHEN** the first invoice is issued for a Factory subscription with a ฿150,000 annual fee and ฿100,000 setup fee and the up-front discount applied
- **THEN** the invoice shows an ANNUAL_FEE line, a SETUP_FEE line, and a negative UPFRONT_DISCOUNT line, with the total computed by decimal helpers
- **AND** a renewal invoice for the same subscription carries no SETUP_FEE line

### Requirement: Payable offline — PDF, bank transfer, PromptPay from the vendor's own payee
Every issued invoice SHALL render to a PDF (M0 `pdf/`) containing the lines, VAT-
exclusive totals, the vendor's bank-transfer details, and a PromptPay QR generated from
`PLATFORM_PROMPTPAY_ID` for the amount due. The tenant-side `PROMPTPAY_ID` MUST never
be used for subscription invoices; if `PLATFORM_PROMPTPAY_ID` is unset the QR section
is omitted (bank transfer remains).

#### Scenario: The QR pays the vendor
- **WHEN** an invoice PDF is generated
- **THEN** its PromptPay payload encodes `PLATFORM_PROMPTPAY_ID` and the invoice total
- **AND** no tenant's PromptPay identity appears

### Requirement: Mark-paid is admin-only, verified, and audited
`POST /platform/subscription-invoices/{id}/mark-paid` SHALL be callable only by a
platform admin, recording `{paid_at, method: BANK_TRANSFER | PROMPTPAY, reference,
amount}`. An `amount` differing from the invoice total MUST be rejected with 422 unless
an explicit override flag is set. The invoice becomes `PAID`, the term extension and
tenant recovery of `subscription-lifecycle` run in the same transaction, and one
`platform_audit_log` row captures the whole before/after. Unpaid invoices are voidable;
`PAID` invoices are not.

#### Scenario: A typo does not extend a term
- **WHEN** an admin marks a ฿150,000 invoice paid with amount "15000.00" and no override flag
- **THEN** the request fails with 422 and neither the invoice status nor the term changes
