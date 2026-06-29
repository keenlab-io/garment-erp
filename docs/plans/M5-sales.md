# M5 — Sales Documents

Spec: [`../BACKEND_SPEC_M1-M6.md`](../BACKEND_SPEC_M1-M6.md) §5. Recipe & shared
primitives: [`README.md`](README.md), [`M0-foundation.md`](M0-foundation.md).

**Depends on:** M1, M0 (sequence, pdf, storage), M3 (item/price, optional stock
OUT). **Replaces the demo in-memory `InvoiceController` with a DB-backed, gated
module** (drop the `@Public()` placeholder).

Responsibilities: customers, Quotation → Invoice → Receipt/Tax-Invoice lifecycle,
VAT (inclusive/exclusive) & WHT, partial billing, PromptPay QR, credit
terms/aging, template export (PDF/Excel/JPG), optional inventory deduction & e-Tax,
void with audit.

---

## 1. Contracts — `dto/sales.ts`

- Customers (`sales.customer.manage`): `POST /customers`, `GET /customers?search=`
  (autocomplete).
- Quotations (`sales.quotation.manage`): `POST /quotations` (`doc_no` auto by mode
  QV/QNV), `/{id}/send|approve|reject`, `/{id}/convert` (`sales.invoice.create`) →
  201 | 409.
- Invoices: `POST /invoices` (`sales.invoice.create`), `/{id}/issue` (optional
  stock OUT), `/{id}/payments` (`sales.payment.record`; issues receipt; sets
  PAID/PARTIALLY_PAID), `/{id}/void` `{reason}` (`sales.document.void`) → 200 |
  409, `GET /{id}/promptpay-qr`, `GET /{id}/export?format=` → 202,
  `GET /{id}/wht-certificate` → 202.
- `GET /reports/aging`, `POST /etax/{invoice_id}/submit` (`sales.etax.submit`) →
  202.

Enums (`enums/sales.ts`): `quotation.status`, `invoice.status` (+ existing
`VatMode`/`DocType`). Permissions in catalog.

---

## 2. DB schema — `packages/db/src/schema/sales/`

Spec §5.2: `customer` (`tax_id`, `branch_code`, `addresses jsonb`,
`credit_terms_days`), `quotation` (`doc_no` unique, `vat_mode`, `vat_calc`,
totals), `invoice` (`doc_no` unique, `quotation_id`, `wht_rate`, totals,
`amount_paid`), `doc_line` (polymorphic `parent_type`/`parent_id`, indexed),
`payment` (`method`, `promptpay_ref`), `receipt_tax_invoice` (`type`),
`wht_certificate`, `document_template` (`layout jsonb`, logo/signature/stamp keys).
`money()`/`rate()` helpers; totals are NUMERIC(18,4).

---

## 3. Nest module — `apps/api/src/sales/`

- **All totals server-computed** from `doc_line` via `@erp/utils` decimal helpers;
  client-sent totals ignored. Round each at 4 dp half-up.
  - **VAT EXCLUDE (Vat Nok)**: `vat = subtotal × rate`; `grand = subtotal + vat`.
  - **VAT INCLUDE (Vat Nai)**: `subtotal = grand / (1+rate)`; `vat = grand −
    subtotal`.
  - **Non-VAT**: `vat = 0`; only a RECEIPT may issue (never `TAX_INVOICE`).
  - **WHT**: `wht = subtotal × wht_rate`; net transfer = `grand − wht`; issue a
    `wht_certificate`.
- **Numbering** via SequenceService: `QV` (VAT) / `QNV` (non-VAT) quotations;
  separate invoice/receipt sequences; yearly reset configurable. Concurrent
  issuance yields zero duplicate `doc_no` (M0 row-lock — verified).
- **Partial billing**: one quotation → many invoices; enforce Σ invoice subtotals
  ≤ quotation subtotal (422 on exceed).
- **Convert**: APPROVED quotation → new invoice copying lines/prices; quotation →
  CONVERTED atomically; re-convert → 409.
- **Payment**: updates `amount_paid`; `= grand − wht` → PAID, `0 < paid < …` →
  PARTIALLY_PAID; issues the receipt/tax-invoice. Emits `PaymentReceived`.
- **Void** (`sales.document.void` + `requireReason`): sets VOID, never deletes; if
  the invoice triggered a stock OUT, post a compensating IN via M3; **blocked 409
  if a receipt/tax-invoice already exists**. Writes audit (`action=VOID`).
- **PromptPay**: generate EMVCo QR payload (PromptPay ID + amount) rendered onto
  the invoice PDF. Exports/certificates run as `pdf`/`default` BullMQ jobs.
- Emits `QuotationApproved`, `InvoiceIssued` (sync → M3 optional OUT),
  `DeliveryNoteIssued`, `PaymentReceived`, `InvoiceOverdue`, `DocumentVoided`.

---

## 4. Tests (spec §5.8)

- Vat Nok line ฿100 ⇒ subtotal 100, VAT 7, grand 107. Vat Nai ฿107 ⇒ subtotal
  100, VAT 7 (correct back-out).
- Services invoice ฿100,000 + WHT 3% ⇒ certificate 3,000, expected net 97,000.
- Convert from APPROVED quotation ⇒ invoice with identical lines/prices; quotation
  CONVERTED; second convert → 409.
- Two invoices off one quotation exceeding its subtotal ⇒ 422 on the second.
- Void after a receipt exists → 409; valid void writes `audit_log`
  (`action=VOID`, reason).
- Concurrent document numbering yields zero duplicate `doc_no`.

Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
