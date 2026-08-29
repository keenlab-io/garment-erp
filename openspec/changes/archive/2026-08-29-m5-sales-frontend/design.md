# M5 — Sales Documents (Frontend): Design

## Context

M5 frontend is document-fidelity work for sales staff + accountants. The signature is the
**document editor with a live paper preview** whose rendering must match the exported PDF 1:1.
Money is tabular; document numbers and tax fields are system-filled, never free-typed where the
system can fill them. `frontend only`, consuming the `sales` contract.

Sequenced **after `m0-frontend-foundation`** + backend `m5-sales`. Per UX Part C, built early
(highest daily business value with M3).

## Shared frontend conventions (FD1–FD12)

M0 `@erp/ui` + tokens (FD1); typed `@ts-rest/react-query` (FD2); routes-as-metadata (FD3);
**document-lifecycle `InkChip`s** — Draft=muted, Issued/Approved=info, Paid=success,
Overdue=danger, Partial=warning, Void=muted+strikethrough (FD4); `MoneyCell` tabular money
(FD5); guarded `ConfirmDialog` for void (reason; blocked if receipt exists) (FD6); **job-toast**
for PDF/Excel/JPG export + e-Tax (FD7); `sales` i18next namespace + **BE/CE dates on documents**
(FD8); app isolation (FD12).

## Module decisions

### MD1. WYSIWYG document editor (the signature)
A split view: **editor left, live paper preview right**. The preview renders on the paper surface
(`--color-bg-paper`, always white) using the **same `@erp/design-tokens` CSS as the backend PDF
template**, so the preview matches the export 1:1. Totals/VAT/WHT compute **live** as the user
types. Money is tabular, right-aligned, two decimals; document numbers in mono.

### MD2. VAT toggle re-breaks totals; WHT shows net-to-receive
The **VAT inclusive/exclusive** toggle visibly changes how totals break out in the preview
(teaching the difference, preventing the classic tax error). WHT renders as a deduction with the
**"net to receive"** highlighted — what the customer actually transfers. A **PromptPay QR block**
(image from the backend) embeds the amount.

### MD3. System-filled fields; customer autocomplete
Customer selection **autocompletes and fills tax-id/branch/address**; document numbering and tax
fields are system-filled, never free-typed where the system can fill them (error prevention).
`Convert to invoice` is one click from an approved quotation (pre-fills identically).

### MD4. Worklist with lifecycle chips + aging
A unified worklist (quotations/invoices/receipts) with **document-lifecycle chips**, an
**aging column** color-coded, filters by type/status/customer/date, and bulk export. Overdue rows
carry a subtle danger tint + a "send reminder" row action. Expired quotations show an EXPIRED chip
+ "duplicate to renew".

### MD5. Payments and guarded void
Recording a payment offers full/partial; full issues a Receipt/Tax Invoice and flips status to
PAID (partial → PARTIALLY_PAID). **Void** uses the guarded `ConfirmDialog` (perm + reason) and is
**blocked with an explanatory dialog when a receipt already exists** — never a silent fail. Void
never deletes (row struck + muted).

### MD6. Template designer
The template editor exposes logo/signature/stamp **asset slots** and an Excel **named-range map**;
changes reflect in the preview.

## Risks / Trade-offs

- **Preview ↔ PDF drift** — the only guard is sharing the token CSS + template markup contract;
  a visual regression check on the preview vs a rendered PDF is advisable (M5 backend owns the
  template).
- **Live recompute cost** — totals recompute on keystroke; debounce and keep money math in
  `@erp/utils` string form (no floats).
- **BE date on documents** — Thai tax documents show the Buddhist-Era year; the shared formatter
  handles locale.

## Sequencing

After `m0-frontend-foundation` + backend `m5-sales`. Third in the UX Part C order.

## Open Questions

- Whether the Excel named-range mapping is edited visually or via a config panel.
- BE-era rendering already resolved to locale-dependent (FD8); confirm document templates match.
