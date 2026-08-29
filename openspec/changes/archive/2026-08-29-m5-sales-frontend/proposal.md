# M5 — Sales Documents (Frontend)

## Why

Sales and accounting live in documents where tax correctness and fidelity are paramount. M5
frontend's signature is the **document editor with a live paper preview** — the preview *is* the
PDF (WYSIWYG), so what the user sees is exactly what exports and what the customer receives.
Switching VAT inclusive/exclusive visibly re-breaks the totals (teaching the difference and
preventing the classic tax error); WHT shows the "net to receive"; a PromptPay QR embeds the
amount.

**UI-only** — consumes the `sales` contract in `@erp/contracts` and the M0 foundation.

## What Changes

- **Sales module** routes (nav `⧉ Sales`): Documents worklist, Document editor, Customers,
  Payments, Templates, Aging dashboard.
- The **split editor ⟷ live preview** (WYSIWYG), the worklist with doc-lifecycle chips + aging,
  payment/receipt issuance, customer autocomplete filling tax fields, the template designer.
- Reuses M0 `DataTable`, `InkChip` (document-lifecycle chips), `MoneyCell`, `ConfirmDialog`
  (void guard), job-toast (export/e-Tax). The paper preview consumes the same `@erp/design-tokens`
  CSS the backend PDF template uses (keeping preview 1:1 with the export).

## Capabilities

New:
1. **document-editor-ui** — the split editor + live paper preview (signature).
2. **documents-worklist-ui** — unified worklist, lifecycle chips, aging column.
3. **payments-ui** — record payment, receipt issuance, guarded void.
4. **customers-ui** — customer list, detail, quick-create with tax autocomplete.
5. **aging-dashboard-ui** — AR aging by bucket.
6. **document-templates-ui** — template designer (assets + named-range map).

## Impact

- **Affected code:** `apps/web` `sales` routes/screens consuming the `sales` contract; new
  `sales` i18next namespace (TH+EN). Paper-preview surface imports `@erp/design-tokens/css`.
- **Depends on:** `m0-frontend-foundation` + backend `m5-sales` contract.
- **No new dependencies.** The PromptPay QR image is produced by the backend; the frontend
  displays it. Contract-only; no cross-app import.
