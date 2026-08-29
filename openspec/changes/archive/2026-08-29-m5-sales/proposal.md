# M5 — Sales Documents

## Why

The platform can manufacture goods (M4) and hold stock (M3) but cannot **sell** them. M5 is
the revenue module: a customer master and the full **Quotation → Invoice →
Receipt/Tax-Invoice** lifecycle with Thai-accounting-correct VAT (inclusive/exclusive) and
withholding-tax computation, partial billing, PromptPay QR payment, credit-terms aging,
branded PDF/Excel/JPG document export, optional inventory deduction and e-Tax XML, and
void-with-audit.

It also **retires the M0 demo `InvoiceController`** — the `@Public()` in-memory placeholder
that currently backs the `invoices` contract — replacing it with a DB-backed,
permission-gated module. The 7 `sales.*` permission codes and the `VatMode`/`DocType` enums
already reserved in `@erp/contracts` are activated here.

## What Changes

- **New `sales` capability set** (9 capabilities below) exposed under `/api/v1` via a new
  `salesContract`, replacing the demo `invoices` contract on the root router.
- **New DB schema** `schema/sales/` — `customer`, `quotation`, `invoice`, `doc_line`,
  `payment`, `receipt_tax_invoice`, `wht_certificate`, `document_template` — plus new sales
  status enums (parity-tested against `@erp/contracts`).
- **New document sequence** `RECEIPT` seeded alongside the existing QV/QNV/INVOICE rows.
- **`@erp/utils`** gains a division / VAT-back-out money helper for VAT-inclusive mode.
- **New backend dependencies** `promptpay-qr`, `qrcode`, `exceljs`; `PdfService` extended to
  emit JPG via puppeteer; a new `PROMPTPAY_ID` env var; a BullMQ repeatable overdue sweep.
- **Domain events:** quotation approval emits `QuotationApproved` (audit/UI); payment emits
  `PaymentReceived`; the overdue sweep emits `InvoiceOverdue`.
- **Cross-module (dormant until M3):** invoice issue emits `InvoiceIssued`/`DeliveryNoteIssued`
  for M3's optional stock OUT; void emits `DocumentVoided` for the compensating IN.

## Capabilities

New:
1. **customers** — customer master + autocomplete search.
2. **quotations** — quotation lifecycle + QV/QNV numbering + 1-click convert to invoice.
3. **invoicing** — invoice lifecycle + issue + partial billing.
4. **vat-wht-computation** — server-computed VAT (include/exclude) + WHT + WHT certificate.
5. **payments-receipts** — payment recording + receipt/tax-invoice issuance.
6. **document-export** — PDF/Excel/JPG export, template customization, PromptPay QR.
7. **document-void** — void with mandatory reason, audit, and compensating stock IN.
8. **aging-overdue** — aging report + overdue sweep.
9. **etax-submission** — non-authoritative RD e-Tax XML submission.

## Impact

- **Affected specs:** 9 new capabilities under the `sales` module.
- **Affected code:** `packages/contracts/src` (`enums/sales.ts`, `dto/sales.ts`, root
  contract — **removes demo `invoices`**), `packages/db/src` (`schema/sales/*`,
  `schema/enums.ts`, `seed`), `packages/utils/src/money.ts`, `apps/api/src/sales/*` (new
  module), `apps/api/src/pdf` (JPG), `apps/api/src/config` (`PROMPTPAY_ID`) — and **deletes**
  the demo `apps/api/src/invoice/` controller + `dto/invoice.ts`.
- **Depends on:** M0 (sequence, pdf, storage, queue, events, audit, idempotency,
  concurrency), M1 (permission resolver). **Optional integration:** M3 (stock OUT/IN) — emitted
  now, consumed once M3 lands; may consume M4 `WorkOrderCompleted` for auto-draft invoices.
- **Migrations:** additive (new sales tables + `RECEIPT` sequence row). No changes to existing
  platform tables.
