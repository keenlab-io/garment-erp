## ADDED Requirements

### Requirement: WYSIWYG document editor with live preview
The document editor SHALL be a split view — line-item editor and a **live paper preview** that
renders on the white paper surface using the same design-token CSS as the backend PDF template,
so the preview matches the exported PDF 1:1. Totals, VAT, and WHT compute live as the user edits.

#### Scenario: Preview matches the export
- **WHEN** a document is edited
- **THEN** the live preview renders as the exported PDF will (same tokens/layout), with totals updating live

### Requirement: VAT mode toggle re-breaks totals; WHT shows net to receive
Switching VAT inclusive/exclusive SHALL visibly re-break the totals in the preview, and for
withholding cases the editor SHALL show WHT as a deduction with the "net to receive" highlighted.
A PromptPay QR block embeds the amount.

#### Scenario: VAT inclusive/exclusive re-breaks totals
- **WHEN** the VAT mode is switched between inclusive and exclusive
- **THEN** the preview re-breaks subtotal/VAT/grand-total accordingly

#### Scenario: Net to receive is shown for withholding
- **WHEN** a document has withholding tax
- **THEN** the "net to receive" (grand minus WHT) is shown highlighted

### Requirement: System-filled fields and convert
Customer selection SHALL autocomplete and fill tax-id/branch/address; document numbers and tax
fields are system-filled, not free-typed. An approved quotation converts to an invoice in one
click, pre-filled identically.

#### Scenario: Customer autocomplete fills tax fields
- **WHEN** a customer is selected
- **THEN** their tax id, branch, and address auto-fill rather than being typed

#### Scenario: One-click convert
- **WHEN** an approved quotation is converted
- **THEN** an invoice opens pre-filled with the same lines and prices
