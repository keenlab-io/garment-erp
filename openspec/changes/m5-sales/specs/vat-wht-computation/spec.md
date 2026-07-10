## ADDED Requirements

### Requirement: Server-computed VAT totals
The system SHALL compute every document's `subtotal`, `vat`, and `grand_total` **server-side**
from its `doc_line` rows, ignoring any client-sent totals, rounding each value at 4 decimal
places half-up:
- **VAT EXCLUDE (VatNok):** `vat = subtotal × rate`; `grand_total = subtotal + vat`.
- **VAT INCLUDE (VatNai):** `subtotal = grand_total / (1 + rate)`; `vat = grand_total − subtotal`.
- **Non-VAT:** `vat = 0`, and only a `RECEIPT` may ever be issued (never a tax invoice).

#### Scenario: VAT-exclusive total adds VAT on top
- **WHEN** a VatNok line of 100 is totaled at a 7% rate
- **THEN** subtotal is 100, VAT is 7, and grand total is 107

#### Scenario: VAT-inclusive total backs VAT out
- **WHEN** a VatNai document with a grand total of 107 is computed at a 7% rate
- **THEN** subtotal is 100 and VAT is 7

#### Scenario: Non-VAT document has zero VAT
- **WHEN** a non-VAT document is computed
- **THEN** VAT is 0 and only a RECEIPT may be issued for it

### Requirement: Withholding tax and certificate
When an invoice carries a `wht_rate`, the system SHALL compute `wht = subtotal × wht_rate`
and a net transfer of `grand_total − wht`, and SHALL issue a `wht_certificate`.

#### Scenario: WHT is computed and a certificate issued
- **WHEN** a services invoice of 100,000 is issued with a 3% withholding rate
- **THEN** the withholding amount is 3,000, the expected net transfer is 97,000, and a `wht_certificate` is issued
