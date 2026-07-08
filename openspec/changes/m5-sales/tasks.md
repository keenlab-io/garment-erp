# M5 — Sales Documents: Tasks

> Sequenced **after M1** (permission resolver). Inventory-linkage emissions
> (`InvoiceIssued`/`DeliveryNoteIssued`/`DocumentVoided`) are **dormant until M3** registers
> the stock handlers. `doc_line.item_id` is a bare uuid until M3's `item` table lands.

## 1. Contracts — `packages/contracts/src`

- [ ] 1.1 Add `enums/sales.ts` — `vat_mode` (`VAT | NON_VAT`), `quotation_status`
  (`DRAFT|SENT|APPROVED|CONVERTED|EXPIRED|REJECTED|VOID`), `invoice_status`
  (`DRAFT|ISSUED|PARTIALLY_PAID|PAID|OVERDUE|VOID`), `receipt_type`
  (`RECEIPT|TAX_INVOICE|RECEIPT_TAX_INVOICE`), `payment_method`. **Reuse** the existing
  `VatMode` (`VatNai|VatNok`) for `vat_calc` and `DocType` (`QV|QNV`) for quotation mode.
- [ ] 1.2 Add `dto/sales.ts` — `salesContract` (`pathPrefix: API_PREFIX`, `withErrors`):
  customers (`create`, `GET ?search=`); quotations (`create`, `send`/`approve`/`reject`,
  `convert`); invoices (`create`, `issue`, `payments`, `void`, `GET /{id}/promptpay-qr`,
  `GET /{id}/export?format=`, `GET /{id}/wht-certificate`); `reports/aging`;
  `etax/{invoice_id}/submit`. Async endpoints return the `jobAccepted` (202 `{ job_id }`)
  shape; lists via `paginationQuery` + `paginated`.
- [ ] 1.3 Register `sales: salesContract` on the root `contract` in `dto/index.ts` and
  **remove the demo `invoices: invoiceContract`** key + the `dto/invoice.ts` export. Export the
  new DTO types. (The 7 `sales.*` codes already exist in the catalog.)
- [ ] 1.4 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. `@erp/utils` — `packages/utils/src`

- [ ] 2.1 Add `divideMoney(a, b)` / `vatBackOut(grand, rate)` to `money.ts`
  (`toDecimal(grand).div(toDecimal(1).plus(rate))`, money scale, half-up) + unit tests
  covering the §5.8 VatNai back-out (107 @ 7% → 100 / 7)

## 3. DB schema — `packages/db/src`

- [ ] 3.1 Add sales enums to `schema/enums.ts` mirroring `enums/sales.ts` (keep the
  `expectTypeOf` parity test green)
- [ ] 3.2 Add `schema/sales/customer.ts` — `customer` (`tax_id`, `branch_code`,
  `addresses jsonb`, `credit_terms_days`, `auditColumns`, `versionColumn`)
- [ ] 3.3 Add `schema/sales/quotation.ts` — `quotation` (`doc_no` unique, `customer_id` FK,
  `vat_mode`, `vat_calc`, `subtotal`/`vat`/`grand_total` `money()`, `status`, `version`)
- [ ] 3.4 Add `schema/sales/invoice.ts` — `invoice` (`doc_no` unique, `quotation_id` FK
  nullable, `customer_id` FK, `wht_rate` `rate()`, totals `money()`, `amount_paid`, `due_date`,
  `status`, `version`)
- [ ] 3.5 Add `schema/sales/doc-line.ts` — `doc_line` (polymorphic `parent_type`/`parent_id`,
  indexed; `item_id` **bare nullable uuid, no FK**; `description`, `qty()`, `unit_price money()`,
  `line_total money()`)
- [ ] 3.6 Add `schema/sales/payment.ts` — `payment` (`invoice_id` FK, `method`, `amount money()`,
  `promptpay_ref`, `paid_at`), `receipt_tax_invoice` (`invoice_id` FK, `doc_no` unique, `type`),
  `wht_certificate` (`invoice_id` FK, `amount money()`, `cert_no`)
- [ ] 3.7 Add `schema/sales/document-template.ts` — `document_template` (`layout jsonb`,
  `logo_key`/`signature_key`/`stamp_key`, `is_active`)
- [ ] 3.8 Re-export `schema/sales/*` from `schema/index.ts`; `pnpm db:generate` and review
- [ ] 3.9 Add the `RECEIPT` seed row to `BASE_SEQUENCES` — `{ key:"RECEIPT", prefix:"RE",
  includeYear:true, resetYearly:true, format:"{prefix}{yyyy}{seq:0000}" }` (renders `RE20260001`)
- [ ] 3.10 `pnpm db:migrate && pnpm db:seed` against dev Postgres; confirm the sales tables and
  the `RECEIPT` sequence

## 4. Config, deps & infra — `apps/api/src`

- [ ] 4.1 Add deps to `apps/api`: `promptpay-qr`, `qrcode`, `exceljs`
- [ ] 4.2 Add `PROMPTPAY_ID` to `config/env.schema.ts` (validated at boot)
- [ ] 4.3 Extend `PdfService` with a `renderJpeg(html)` path
  (`page.screenshot({ type:"jpeg" })`) reusing the shared Chromium
- [ ] 4.4 Register a BullMQ **repeatable** overdue-sweep job on the `default` queue (cadence
  configurable, default daily) + a `BaseWorker` subclass; upsert the repeatable job at module init

## 5. Nest module — `apps/api/src/sales`

- [ ] 5.1 `CustomerService` — create + autocomplete search
- [ ] 5.2 `QuotationService` — create (QV/QNV via SequenceService), lifecycle
  (`send`/`approve` → emit `QuotationApproved`/`reject`), **convert** (copy lines/prices → invoice, quotation → CONVERTED
  atomically; re-convert → 409; `Idempotency-Key` replay returns the same invoice)
- [ ] 5.3 `TotalsService` — compute subtotal/vat/grand from `doc_line` (VatNok add-on / VatNai
  back-out / non-VAT), WHT + `wht_certificate`; all via `@erp/utils`, 4dp half-up
- [ ] 5.4 `InvoiceService` — create (INVOICE sequence), lifecycle, `issue` (emit `InvoiceIssued`
  / `DeliveryNoteIssued` for optional stock OUT), **partial billing** ceiling (Σ subtotals ≤
  quotation subtotal → 422)
- [ ] 5.5 `PaymentService` — record payment (update `amount_paid` → PAID/PARTIALLY_PAID), issue
  `receipt_tax_invoice` (RECEIPT for non-VAT, tax-invoice for VAT) from the RECEIPT sequence,
  emit `PaymentReceived`
- [ ] 5.6 `PromptPayService` — build the EMVCo payload (`promptpay-qr`) from `PROMPTPAY_ID` +
  amount, render PNG (`qrcode`); `GET /promptpay-qr` returns `{ payload, png_base64 }`
- [ ] 5.7 `ExportService` — PDF (`PdfService`), Excel (`exceljs`), JPG (`PdfService.renderJpeg`)
  + WHT certificate as `pdf`-queue jobs (202 `{ job_id }`); `document_template` assets via
  `StorageService`
- [ ] 5.8 `VoidService` — void (`requireReason`; VOID never deletes; **409 if a
  `receipt_tax_invoice` exists**; emit `DocumentVoided` for the compensating IN; audit
  `action=VOID`)
- [ ] 5.9 `OverdueMonitor` (the sweep worker: past `due_date` & not PAID → OVERDUE +
  `InvoiceOverdue`) and `AgingReportService` (`GET /reports/aging`, bucketed)
- [ ] 5.10 `EtaxService` — `POST /etax/{id}/submit` → 202 async RD e-Tax XML job (stub,
  non-authoritative)
- [ ] 5.11 ts-rest `SalesController`(s) — in-handler `assertPermissions(user, "sales.…")`;
  wrap mutations in `uow.withTransaction`; `SalesModule` wired into `app.module.ts`. **Delete
  the demo `apps/api/src/invoice/` controller/module.**
- [ ] 5.12 Verify: `pnpm build && pnpm typecheck && pnpm lint` green; API boots and maps the new
  `/api/v1` sales routes (and no longer the demo `invoices`)

## 6. Tests (spec §5.8)

- [ ] 6.1 VatNok line ฿100 ⇒ subtotal 100 / VAT 7 / grand 107; VatNai ฿107 ⇒ subtotal 100 /
  VAT 7 (correct back-out)
- [ ] 6.2 Services invoice ฿100,000 + WHT 3% ⇒ certificate 3,000, expected net 97,000
- [ ] 6.3 Convert an APPROVED quotation ⇒ invoice with identical lines/prices, quotation
  CONVERTED; second convert ⇒ 409
- [ ] 6.4 Two invoices off one quotation exceeding its subtotal ⇒ 422 on the second
- [ ] 6.5 Void after a receipt exists ⇒ 409; valid void writes `audit_log` (`action=VOID`,
  reason)
- [ ] 6.6 Concurrent document numbering ⇒ zero duplicate `doc_no`

## 7. Verification

- [ ] 7.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
- [ ] 7.2 `pnpm db:generate` clean after schema; `pnpm db:migrate && pnpm db:seed` run cleanly
  against a fresh DB (sales tables + `RECEIPT` sequence)
- [ ] 7.3 Boot `pnpm dev` and drive: create customer → quotation (QV) → send → approve →
  convert → invoice issue → record payment → receipt issued → export (pdf/xlsx/jpg) + PromptPay
  QR → run the overdue sweep → void path (409 after receipt); confirm the demo `invoices`
  endpoints are gone
