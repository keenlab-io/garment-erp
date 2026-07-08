# M5 — Sales Documents: Design

## Context

M5 turns priced work into legal documents and cash. It reuses the entire M0 cross-cutting
layer (sequencing, PDF, storage, queue, events, audit, idempotency, concurrency) and the 7
`sales.*` catalog codes. The hard parts are **Thai-accounting-correct money math** (VAT
include/exclude back-out, WHT), **race-safe document numbering**, and the **document
lifecycle invariants** (convert-once, partial-billing ceiling, void-after-receipt block).
Everything is `backend only`; the wireframes remain the visual source of truth for the later
frontend milestone.

Sequenced **after M1** (permission resolver). Cross-module ties to M3 (stock) and M4 (work
orders) are **emitted/consumed defensively** — the events fire, but no handler is registered
until those modules are applied.

## Goals / Non-Goals

**Goals:** customer master; quotation/invoice/receipt lifecycle; correct VAT + WHT; partial
billing; PromptPay QR; PDF/Excel/JPG export with templates; aging + overdue detection; void
with audit; optional inventory deduction + e-Tax XML; retire the demo invoice endpoints.

**Non-Goals:** frontend; a real e-Tax RD submission (stub/non-authoritative only); a
notification **delivery** worker (events are emitted/enqueued, delivery is deferred);
multi-currency; per-company template theming beyond logo/signature/stamp.

## Decisions

### D1. VAT enum reconciliation
The existing `VatMode = {VatNai, VatNok}` is the spec's **`vat_calc`** dimension
(VatNai = INCLUDE, VatNok = EXCLUDE) — **reuse it** for the `vat_calc` column. Add a **new**
enum for the spec's `vat_mode` (`VAT | NON_VAT`), and reuse `DocType = {QV, QNV}` for the
quotation numbering mode. Add `quotation_status`, `invoice_status`, `receipt_type`
(`RECEIPT | TAX_INVOICE | RECEIPT_TAX_INVOICE`), and `payment_method` to both
`@erp/db/schema/enums.ts` and `@erp/contracts/enums` (the `expectTypeOf` parity test keeps
them locked in step).

### D2. Server-computed totals + VAT back-out
All totals are computed **server-side** from `doc_line` via `@erp/utils`; client-sent totals
are ignored. Each value is rounded at **4 dp, half-up**.
- **VAT EXCLUDE (VatNok):** `vat = subtotal × rate`; `grand = subtotal + vat`.
- **VAT INCLUDE (VatNai):** `subtotal = grand / (1 + rate)`; `vat = grand − subtotal`.
- **Non-VAT:** `vat = 0`; only a `RECEIPT` may ever issue (never a tax invoice).
`money.ts` currently has no division primitive, so add a small `divideMoney`/`vatBackOut`
helper (`toDecimal(grand).div(toDecimal(1).plus(rate))`) rather than scattering
`toDecimal().div()` through the services.

### D3. WHT
`wht = subtotal × wht_rate`; net transfer = `grand − wht`; issue a `wht_certificate`. The
certificate renders as an async export job.

### D4. Document numbering
QV/QNV/INVOICE sequences are already seeded. **Add a `RECEIPT` sequence row** to
`BASE_SEQUENCES` (`{ key:"RECEIPT", prefix:"RE", includeYear:true, resetYearly:true,
format:"{prefix}{yyyy}{seq:0000}" }`). `SequenceService.next(key)` runs in a tx and row-locks
the single sequence row, so concurrent issuance yields **zero duplicate `doc_no`** (§5.8).

### D4b. Quotation approval emits an event
`approve` publishes `QuotationApproved` (via `publishAfterCommit`) so the audit subscriber and
any UI/notification consumer observe the approval on the bus — matching §7's
`QuotationApproved` (M5 → UI/audit, async). Without it the approval leaves no domain-event
trace.

### D5. Convert (quotation → invoice)
Only an **APPROVED** quotation converts: copy its lines/prices into a new invoice and flip the
quotation to **CONVERTED** in one `uow.withTransaction`. A re-convert is guarded by the
quotation status (+ `assertVersion` on the `If-Match` version) → **409**. An `Idempotency-Key`
replay of the same convert returns the same invoice (via `IdempotencyService`).

### D6. Partial billing
One quotation → many invoices. Before persisting an invoice against a quotation, enforce
`Σ(invoice subtotals for that quotation) ≤ quotation subtotal` → **422** on exceed.

### D7. Payment → receipt
Recording a payment updates `amount_paid`: `amount_paid = grand − wht` → **PAID**;
`0 < amount_paid < grand − wht` → **PARTIALLY_PAID**. It issues a `receipt_tax_invoice`
(a plain `RECEIPT` for non-VAT; a `TAX_INVOICE`/`RECEIPT_TAX_INVOICE` for VAT) and emits
`PaymentReceived`.

### D8. Void
`sales.document.void` + `AuditService.requireReason` (blank reason → 422). Void sets status
**VOID** and never deletes. It is **blocked with 409 if a `receipt_tax_invoice` already
exists** for the document. If the invoice previously triggered a stock OUT, it emits
`DocumentVoided` so M3 posts a compensating IN. An `audit_log` row is written with
`action = VOID` (the `AuditAction.VOID` value already exists).

### D9. PromptPay QR
`promptpay-qr` builds the EMVCo payload from a configured PromptPay ID (new `PROMPTPAY_ID`
env, validated in `env.schema.ts`) plus the invoice amount; `qrcode` renders the PNG.
`GET /invoices/{id}/promptpay-qr` returns `{ payload, png_base64 }`, and the PNG is embedded
onto the invoice PDF.

### D10. Export
PDF via `PdfService.renderHtml`; Excel via `exceljs`; **JPG** by extending `PdfService` with a
`page.screenshot({ type:"jpeg" })` path that reuses the same shared Chromium (no image lib).
`GET /invoices/{id}/export?format=pdf|xlsx|jpg` and the WHT certificate run as **async jobs**
on the `pdf` queue → **202 `{ job_id }`**. `document_template` holds a `layout jsonb` plus
logo/signature/stamp storage keys served through `StorageService`.

### D11. Overdue sweep (net-new scheduler)
No scheduling infra exists yet. Register a BullMQ **repeatable** job on the existing `default`
queue (daily, cadence configurable) that flips invoices past `due_date` and not PAID →
**OVERDUE** and emits `InvoiceOverdue`. BullMQ `repeat` needs no new dependency. The aging
report (`GET /reports/aging`) is a read-only bucketed query (current / 1-30 / 31-60 / 61-90 /
90+) and needs no scheduler.

### D12. Optional integrations (both included)
- **Inventory:** invoice `issue` emits `InvoiceIssued` (and `DeliveryNoteIssued` when a
  delivery note is produced) via `publishInTransaction` so M3 can post an optional stock OUT
  atomically; `void` emits `DocumentVoided` for the compensating IN. **Dormant** until M3's
  stock module registers the handlers.
- **e-Tax:** `POST /etax/{invoice_id}/submit` (`sales.etax.submit`) → **202** async job that
  produces an RD e-Tax XML document, explicitly flagged **non-authoritative** (stub builder),
  mirroring M2's PND.1 treatment.

### D13. Cross-module `item` FK as a bare column
M3's `item` table isn't applied, so `doc_line.item_id` is a **bare nullable `uuid()` with no
`.references()`** — the same precedent as `auditColumns.created_by/updated_by`. A later
migration adds the FK once `item` exists.

### D14. Retire the demo invoice
Remove `packages/contracts/src/dto/invoice.ts` (the demo contract) and
`apps/api/src/invoice/InvoiceController` (`@Public()` in-memory store); the root `contract`'s
`invoices` key is replaced by the real `sales` contract. This drops the last `@Public()`
business endpoint.

## Risks / Trade-offs

- **Money correctness** is the top risk — mitigated by centralizing all math in `@erp/utils`
  with the §5.8 worked examples as unit tests (VatNok 100→107, VatNai 107→100/7, WHT 3%).
- **Emitting to absent consumers** (M3/M4): events fire with no handler until those modules
  land. Acceptable — `EventBus` tolerates zero subscribers; the contract is documented here.
- **e-Tax stub** could be mistaken for a real submission — mitigated by the explicit
  non-authoritative flag on the response and in the spec.
- **Repeatable job duplication** across API replicas — mitigated by BullMQ's repeatable-job
  dedupe (single job key), same pattern M4 introduces for its monitor.

## Migration Plan

Additive only: new `schema/sales/*` tables + the `RECEIPT` sequence seed row. No existing
platform table changes. The demo-invoice removal is code-only (no data — it was in-memory).
Apply order: **M1 → M5**; inventory-linkage emissions activate when **M3** is applied.

## Open Questions

- Notification **delivery** worker for `InvoiceOverdue`/`PaymentReceived` (email/line queues
  exist; no worker yet) — emitted/enqueued now, delivery deferred.
- Exact RD e-Tax XML layout (kept non-authoritative until confirmed).
- PromptPay ID source — single `PROMPTPAY_ID` env now vs per-company config later.
- Overdue-sweep cadence (default daily).
- Receipt-type selection rule for VAT documents (`TAX_INVOICE` vs `RECEIPT_TAX_INVOICE`) —
  defaulted to `RECEIPT_TAX_INVOICE` on payment; revisit with accounting.
