# M5 — Sales Documents (Frontend): Tasks

> Applies after `m0-frontend-foundation` + backend `m5-sales`. UI-only; consumes the `sales`
> contract. Paper preview shares `@erp/design-tokens/css` with the backend PDF template.

## 1. Deps, routes & i18n

- [x] 1.1 Register `sales` routes with metadata + required `Permission`: `/sales/documents(/{id})`,
  `/sales/documents/{id}/edit`, `/sales/customers(/{id})`, `/sales/payments`, `/sales/templates`,
  `/sales/aging`
- [x] 1.2 Add the `sales` i18next namespace (TH+EN); nav + ⌘K from route metadata

## 2. Data layer

- [x] 2.1 `sales` query/mutation hooks (customers, quotations, invoices, payments, receipts,
  templates, aging, promptpay-qr, export, etax) + invalidation; job-status polling for export/e-Tax

## 3. Module components

- [ ] 3.1 **DocumentLineEditor** (item lookup + qty + unit price + total)
- [ ] 3.2 **PaperPreview** surface (token-CSS, WYSIWYG = the PDF) with live totals
- [ ] 3.3 **VatModeCalcToggle** (preview-linked) + **WhtNetToReceivePanel** + **PromptPayQrBlock**
- [ ] 3.4 **DocLifecycleChip**, **AgingBucketChip**, **CustomerAutocomplete** (fills tax fields),
  **TemplateDesigner** (asset slots + named-range map)

## 4. Screens / flows

- [ ] 4.1 `document-editor-ui` — split editor ⟷ live preview; VAT toggle re-breaks totals; WHT
  net-to-receive; PromptPay QR; convert-to-invoice; sticky footer (MD1–MD3)
- [ ] 4.2 `documents-worklist-ui` — unified worklist, lifecycle chips, aging column, filters, bulk
  export, overdue reminder, expired duplicate (MD4)
- [ ] 4.3 `payments-ui` — record payment (full/partial) → receipt/tax-invoice; guarded void (blocked if receipt exists) (MD5)
- [ ] 4.4 `customers-ui` — customer list, detail (docs/aging), quick-create (tax autocomplete)
- [ ] 4.5 `aging-dashboard-ui` — AR aging by bucket
- [ ] 4.6 `document-templates-ui` — template designer (assets + named-range map) (MD6)

## 5. i18n, a11y & Storybook

- [ ] 5.1 TH+EN strings for `sales`; BE/CE dates + Thai document-type names (`ใบเสนอราคา / Quotation`)
- [ ] 5.2 WCAG AA: preview/editor focus order, lifecycle chips not color-only, tabular money alignment
- [ ] 5.3 Stories: PaperPreview, VatModeCalcToggle, DocLifecycleChip, TemplateDesigner at theme×density×locale

## 6. Verification

- [ ] 6.1 `pnpm --filter @erp/web build && typecheck && lint` green; Storybook renders
- [ ] 6.2 Preview matches the exported PDF 1:1 (shared token CSS); VAT toggle re-breaks totals correctly
- [ ] 6.3 Drive: new quotation (customer autocomplete fills tax fields) → live preview → send → approve →
  convert → issue (PromptPay QR) → record payment → receipt; void blocked when a receipt exists (explanatory dialog)
