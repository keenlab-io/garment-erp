# Sales (M5) — UI test cases

UI test cases for the Sales module (`/sales/*`): unified documents worklist + editor (quotation →
invoice lifecycle), Thai-tax specifics (VAT modes, WHT net-to-receive, PromptPay QR, e-Tax),
customers, payments, AR aging, and the template designer. Screens live in
`apps/web/src/router/routes/sales/`; feature components in `apps/web/src/sales/components/`.

**Coverage checklist**

- [x] Smoke: documents worklist renders (TC-SALES-01)
- [x] Golden path: quotation → send → approve → convert → issue → pay (TC-SALES-02)
- [x] Permission gate: quotation.manage vs invoice.create vs document.void (TC-SALES-03)
- [x] High-risk: VAT mode/calc arithmetic (TC-SALES-04)
- [x] High-risk: WHT net-to-receive arithmetic (TC-SALES-05)
- [x] High-risk: PromptPay QR block gating (TC-SALES-06)
- [x] High-risk: invoice void — reason gate + receipt-blocked 409 (TC-SALES-07)
- [x] Payments: partial → full, receipt issuance (TC-SALES-08)
- [x] Customers list/detail + autocomplete (TC-SALES-09)
- [x] AR aging dashboard (TC-SALES-10)
- [x] Templates designer + paper preview (TC-SALES-11)
- [x] e-Tax submit — FLAGGED: no UI surface (TC-SALES-12)

**Persona setup note.** `VITE_DEV_PERMISSIONS` is unit-test-only — limited personas are real users
created via `/admin/roles` + `/admin/users` as `superadmin`, then signed in (**flagged test-data
gap: no seeded limited personas**).

**Session-store caveat (affects most cases).** The `sales` contract has no list/get endpoint for
quotations/invoices — the worklist, editor (after create), and payments picker read a
**session-local document store**. A page reload empties the worklist and payments picker (documents
persist server-side, but the UI can't re-fetch them). Run each lifecycle case in one continuous
session, and treat this as a flagged contract gap, not a bug to file per-case.

---

### TC-SALES-01 — Documents worklist smoke: route loads and key elements render
- **Target**: App @ :5173 `/sales/documents`
- **Persona**: super-admin
- **Preconditions**: logged in; fresh session
- **Priority**: smoke
- **Steps**:
  1. Navigate to `/sales/documents` (sidebar: Sales → Documents).
- **Expected**:
  1. Heading "Documents" and a "New document" button.
  2. Toolbar: type filter chips "All" / "Quotations" / "Invoices" (`aria-pressed`), a Status select, a "Filter by customer…" input, and a from-date input.
  3. Table columns: "Doc no." / Customer / Status / Aging / "Grand total" / Date; fresh session shows the empty state "No documents yet. Create a quotation or invoice to get started." (session store — see caveat above).
- **Automation notes**: `getByRole("button", { name: "New document" })`; filters by aria-label ("From date", "Filter by customer…").

### TC-SALES-02 — Golden path: quotation → send → approve → convert → issue → pay
- **Target**: App @ :5173 `/sales/documents/new/edit` → `/sales/documents/$id/edit` → `/sales/payments`
- **Persona**: super-admin (bypasses all of `sales.quotation.manage`, `sales.invoice.create`, `sales.payment.record`)
- **Preconditions**: at least one customer (create via TC-SALES-09 first) and one inventory item; single continuous session
- **Priority**: golden-path
- **Steps**:
  1. Click "New document". On the editor, leave "Document type" = "Quotation".
  2. In the customer autocomplete ("Look up a customer…"), search ("Search by name or tax id…") and pick the customer.
  3. In the line editor, pick an "Item" ("Look up an item…"), confirm Description autofills/edit it, set Qty `2`, "Unit price" `500`; note the live "Total". Click "+ Add line" then "Remove" to exercise line management.
  4. Set "Valid until" to a future date. Click "Create quotation".
  5. Click "Send". Then click "Approve".
  6. Click "Convert to invoice".
  7. On the invoice editor, click "Issue".
  8. Click "Go to payments"; on `/sales/payments` select the invoice, keep the prefilled full amount, method "Bank transfer", click "Record payment".
- **Expected**:
  1. Split layout: form left, live **paper preview** right showing the bilingual doc type "ใบเสนอราคา / Quotation" (locale-invariant), "Bill to", line rows, and totals — updating as you type.
  2. "Create quotation" is disabled until customer + ≥1 valid line; after create: toast "Document created", URL flips to `/sales/documents/<id>/edit`, the header shows the doc no. (e.g. `QT…`) with a "Draft" lifecycle chip, and the form becomes a read-only summary (no post-create editing — contract has no update endpoint; flagged gap).
  3. Send → toast "Quotation sent", chip "Sent" (Reject also appears at this state). Approve → toast "Quotation approved", chip "Approved".
  4. Convert → toast "Converted to invoice", navigates to the new invoice's editor; paper preview now reads "ใบแจ้งหนี้ / Invoice"; chip "Draft".
  5. Issue → toast "Invoice issued"; chip "Issued"; the PromptPay block appears (TC-SALES-06).
  6. Payments: recording the full outstanding → toast "Payment recorded"; chip "Paid"; a green receipt block shows the receipt doc no. + "Receipt issued <date>".
  7. Back on `/sales/documents`, both documents are listed — quotation status "Converted", invoice "Paid".
- **Automation notes**: lifecycle buttons appear one-at-a-time by status — wait for the chip text to change before clicking the next action. Doc id comes from the URL after create. Flag: the paper preview totals have no test ids; assert by label + adjacent text within the preview region.

### TC-SALES-03 — Permission gate: quotation.manage vs invoice.create vs document.void
- **Target**: App @ :5173 `/sales/documents/$id/edit` and `/sales/payments`
- **Persona**: three limited users — A: `sales.quotation.manage`; B: `sales.invoice.create,sales.payment.record`; C: `sales.payment.record` only
- **Preconditions**: users A/B/C created via Admin UI per the setup note (**flagged gap: manual setup**); a quotation at status "Approved" and an issued invoice, each created **within the acting user's own session** (session store — documents created by another user/session are not visible in the worklist)
- **Priority**: permission-gate
- **Steps**:
  1. As **A**: create a quotation, Send, Approve (all allowed); then hover the "Convert to invoice" button on the approved quotation.
  2. As **B**: create an invoice and Issue it (allowed); go to `/sales/payments`, select it, open "Void", fill a reason and confirm.
  3. As **C**: check the sidebar/palette; on `/sales/payments` (allowed) record a payment; attempt Void.
- **Expected**:
  1. A can Send/Approve ("Send"/"Approve" are PermissionButtons gated on `sales.quotation.manage`); "Convert to invoice" renders disabled (`aria-disabled="true"`) with tooltip "Requires sales.invoice.create".
  2. B can create + Issue (gated `sales.invoice.create`). In the Void guarded dialog, the confirm button "Void" stays **disabled** without `sales.document.void` (GuardedActionDialog re-checks the permission at confirm) — the void cannot be completed.
  3. C's nav shows Sales with only "Payments" (documents/templates need quotation.manage or invoice.create; customers needs customer.manage; aging needs report.sales.view); `/sales` redirects to `/sales/payments`; recording a payment works; Void confirm stays disabled as in (2).
- **Flag**: the catalog permission `sales.invoice.approve` is **not referenced by any screen** — quotation Approve is gated by `sales.quotation.manage` and invoice Issue by `sales.invoice.create`. Either the catalog entry is dormant or a gate is missing; surface for product/security review rather than asserting behavior on it.
- **Automation notes**: tooltip via hover/focus (`getByRole("tooltip")`); disabled confirm via `aria-disabled`/`disabled` on the dialog's "Void" button.

### TC-SALES-04 — High-risk: VAT mode/calc arithmetic (Incl. / Excl. / Non-VAT)
- **Target**: App @ :5173 `/sales/documents/new/edit` (quotation form)
- **Persona**: super-admin
- **Preconditions**: a customer and an item; VAT rate is fixed at 7%
- **Priority**: high-risk
- **Steps**:
  1. Start a new quotation; add one line: Qty `2`, Unit price `500` (line total 1,000.00).
  2. With the VAT toggle at "VAT" + Calc "Excl." (the default), read Subtotal / VAT / "Grand total" in the paper preview.
  3. Switch Calc to "Incl."; re-read totals.
  4. Switch the VAT mode to "Non-VAT"; re-read totals.
  5. Set Calc back to "Excl.", create the quotation, and compare the persisted totals against step 2.
- **Expected**:
  1. Line "Total" = 1,000.00 (qty × unit price − discount).
  2. **Exclusive**: Subtotal 1,000.00, VAT 70.00, Grand total 1,070.00.
  3. **Inclusive**: Grand total 1,000.00, Subtotal 934.58 (1,000 ÷ 1.07, money-rounded), VAT 65.42 — subtotal + VAT re-sum to the grand total exactly.
  4. **Non-VAT**: Subtotal 1,000.00, VAT 0.00, Grand total 1,000.00.
  5. Server-persisted totals equal the client preview (the client mirrors `TotalsService.compute`; client-sent totals are ignored server-side — any drift here is a release-blocking bug).
- **Automation notes**: the toggle renders as labelled controls "VAT"/"Non-VAT" and "Incl."/"Excl." under labels "VAT" and "Calc". Money strings may render with thousands separators per locale — normalize before numeric compare. Discounts: add a Discount `100` variant (line total 900.00 → Excl.: VAT 63.00, grand 963.00) if time permits.

### TC-SALES-05 — High-risk: WHT net-to-receive arithmetic on an invoice
- **Target**: App @ :5173 `/sales/documents/new/edit` (invoice form)
- **Persona**: super-admin
- **Preconditions**: customer + item
- **Priority**: high-risk
- **Steps**:
  1. Start a new document; set "Document type" = "Invoice".
  2. Add one line Qty `2` × Unit price `500`; set "Due date" and "Credit terms (days)" `30`.
  3. In the WHT panel, leave "WHT rate" empty; read the panel.
  4. Enter WHT rate `0.03` (3%); read the panel.
  5. Click "Create invoice" and verify the persisted document shows the same figures.
- **Expected**:
  1. Empty rate: the panel shows "No withholding"; Net to receive equals Grand total.
  2. With `0.03`: Subtotal 1,000.00 / VAT 70.00 / Grand total 1,070.00; WHT shows −30.00 (3% × **subtotal**, not grand total); "Net to receive" 1,040.00 (grand − WHT), highlighted as the accent figure. The paper preview mirrors WHT + Net to receive.
  3. After create the totals persist identically (server recomputes; drift = bug).
- **Automation notes**: the rate is a free-text fraction (`0.03`), not a percent picker — **flag**: a percent-labelled input or preset select (1/2/3/5%) would prevent operator error; assert the panel's minus-sign rendering `−30.00`/`-30.00` tolerantly.

### TC-SALES-06 — High-risk: PromptPay QR appears only once the invoice is issued
- **Target**: App @ :5173 `/sales/documents/$id/edit` (invoice)
- **Persona**: super-admin
- **Preconditions**: draft invoice from TC-SALES-05
- **Priority**: high-risk
- **Steps**:
  1. On the **draft** invoice's editor, look for the PromptPay block.
  2. Click "Issue".
  3. Inspect the PromptPay block.
- **Expected**:
  1. Draft: no QR — the block (or its empty state "Issue the invoice to generate a PromptPay QR") communicates issuance is required; the QR query does not even fire pre-issue.
  2. After issue: a "PromptPay" block renders the QR image, "Scan to pay" hint, the invoice amount, and a "Ref" value (the payment reference to reconcile against).
  3. Recording a PromptPay payment later (`/sales/payments`, method "PromptPay") exposes a "PromptPay ref" field — enter the same ref; payment records normally.
- **Automation notes**: QR by `getByRole("img")` inside the PromptPay region — flag: give the QR an explicit alt/test id if assertion proves brittle; "Ref" asserted by label + adjacent mono text.

### TC-SALES-07 — High-risk: invoice void — required reason, and 409 when a receipt exists
- **Target**: App @ :5173 `/sales/payments`
- **Persona**: super-admin (void permission `sales.document.void` bypassed; see TC-SALES-03 for the gated variant)
- **Preconditions**: same session holds (a) an **issued, unpaid** invoice and (b) a **paid** invoice with a receipt (from TC-SALES-02/08)
- **Priority**: high-risk
- **Steps**:
  1. Select invoice (a); click "Void". In the dialog, click the confirm "Void" with the reason blank.
  2. Type a reason (e.g. `Customer cancelled order`), confirm.
  3. Select invoice (b) (receipt block visible); click "Void", fill a reason, confirm.
- **Expected**:
  1. GuardedActionDialog (`document-void` preset): title `Void <doc no.>?`, consequence "This voids <doc no.> and cannot be undone.", destructive styling; blank reason blocks submit with an inline required-reason error — no request fires.
  2. Toast "Invoice voided"; the invoice's lifecycle chip flips to "Void" rendered **muted + strikethrough** (the InkChip void signature) in the payments list and worklist; payment controls disappear (VOID is not payable).
  3. The API 409s; the void dialog closes and an explanatory dialog opens instead: title "Can't void this invoice", body "A receipt or tax invoice has already been issued for this invoice, so it can't be voided.", with a "Close" button. No state changes.
- **Automation notes**: assert strikethrough via the chip's void-status class/computed style — flag: a `data-status="void"` on InkChip would beat class-name matching. The 409 path must assert the *blocked* dialog, not a toast.

### TC-SALES-08 — Payments: partial then full payment, receipt issuance
- **Target**: App @ :5173 `/sales/payments`
- **Persona**: super-admin (`sales.payment.record`)
- **Preconditions**: an issued invoice for 1,070.00 in this session
- **Priority**: golden-path
- **Steps**:
  1. Select the invoice; verify "Grand total" / "Amount paid" / "Outstanding" read 1,070.00 / 0.00 / 1,070.00 and the amount field prefills the outstanding.
  2. Overwrite Amount with `500`, method "Cash", click "Record payment".
  3. Record a second payment for the (re-prefilled) remaining `570`, method "Bank transfer".
- **Expected**:
  1. Left rail lists the session's invoices (doc no., customer, lifecycle chip); "Select an invoice to record a payment." until one is chosen; methods offered: "Bank transfer", "PromptPay", "Cash", "Cheque", "Credit card".
  2. Partial: toast "Payment recorded"; chip → "Partially paid"; Amount paid 500.00; Outstanding 570.00.
  3. Full: toast "Payment recorded"; chip → "Paid"; Outstanding 0.00; the green receipt block appears with the receipt doc no. and "Receipt issued <date>" — the receipt is only issued on the clearing payment.
- **Automation notes**: **flag** — after recording, the invoice's new `amount_paid`/status are *client-derived* (the contract's `recordPayment` response omits the updated invoice); a server-recompute assertion needs a reload… which empties the session store. Until a `getInvoice` endpoint exists, cross-check via the AR aging report instead (paid invoice drops out of buckets).

### TC-SALES-09 — Customers: list, search, create, detail
- **Target**: App @ :5173 `/sales/customers` (+ `/sales/customers/$id`)
- **Persona**: super-admin (`sales.customer.manage`)
- **Preconditions**: logged in
- **Priority**: golden-path
- **Steps**:
  1. Navigate to `/sales/customers`; click "New customer".
  2. Fill "Name" `Bangkok Textiles Co., Ltd.`, "Tax id" (13 digits — hint "13-digit tax identification number"), "Branch code" `00000`, "Credit terms (days)" `30`, "Address"; submit "Create customer".
  3. Use the search input ("Search by name or tax id…") with a name fragment and with the tax id.
  4. Open the customer's detail ("View").
  5. Back in the document editor (TC-SALES-02), type the same fragment in the customer autocomplete.
- **Expected**:
  1. Toast "Customer created"; list columns: Name / "Tax id" / Branch / "Credit terms" (rendered `30 days`).
  2. Both searches narrow to the customer (server-side name/tax_id search).
  3. Detail: "Back to customers", profile fields, an "AR aging" section (or "No outstanding balance on record.") and "Documents this session" (or its empty text — session-store caveat applies).
  4. The autocomplete lists the customer with matching metadata; selecting it fills the editor's Bill-to (name, tax id, branch, default address) on the paper preview.
- **Automation notes**: autocomplete is a Radix popover + search field — `getByRole("combobox"/"button", { name: "Look up a customer…" })`, then type into "Search by name or tax id…", pick via `getByRole("option")`.

### TC-SALES-10 — AR aging dashboard: buckets, totals, as-of date
- **Target**: App @ :5173 `/sales/aging`
- **Persona**: super-admin (route gated by `report.sales.view` — note: the *report* namespace, not `sales.*`)
- **Preconditions**: at least one issued, unpaid invoice with a past due date (create an invoice with a due date in the past and issue it)
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/sales/aging`.
  2. Read the summary strip and the table.
  3. Change "As of" to a date before the invoice's due date; re-read.
- **Expected**:
  1. Heading "AR aging"; a five-bucket summary strip — "Current", "1–30 days", "31–60 days", "61–90 days", "90+ days" — each with a money total; the strip only renders when rows exist.
  2. Table: Customer column + the five bucket money columns; the overdue invoice's amount sits in the bucket matching its days-overdue; per-bucket strip totals equal the column sums.
  3. Moving "As of" earlier re-buckets (the invoice shifts toward "Current"/drops out); empty result → "No outstanding balances."
- **Automation notes**: the worklist's per-row `AgingBucketChip` (TC-SALES-01 Aging column) uses the same bucket labels — cross-assert one invoice shows the same bucket in both places.

### TC-SALES-11 — Templates: asset slots + named-range map reflected in the paper preview
- **Target**: App @ :5173 `/sales/templates`
- **Persona**: super-admin (route gated `sales.quotation.manage`/`sales.invoice.create`)
- **Preconditions**: small PNG files on disk for upload
- **Priority**: golden-path
- **Steps**:
  1. Navigate to `/sales/templates`.
  2. Upload an image into each asset slot: "Logo", "Signature", "Stamp"; then "Remove" the stamp.
  3. Add a named-range mapping ("+ Add mapping"): "Named range" `CUSTOMER_NAME` → "Document field"; remove it again.
- **Expected**:
  1. Heading "Document templates" + description; left panel "Assets" (three slots showing "Not set" initially) and "Excel named-range map"; right panel: a sample paper preview — doc type "ใบเสนอราคา / Quotation", doc no. `QV20260001`, date "1 Jan 2026", customer "Sample Customer Co., Ltd.", two sample lines totalling 1,250.00 / VAT 87.50 / grand 1,337.50.
  2. The uploaded logo renders overlaid top-right of the preview immediately; signature/stamp render in the preview footer; Remove clears them.
  3. **Flag (by design, verify the copy makes it clear):** this screen is a pure client-side workbench — the contract has no `document_template` endpoints, so nothing persists across reload. Assert the volatility (reload → "Not set" again) so a regression toward silent fake-persistence is caught.
- **Automation notes**: file inputs per slot via the "Upload" control's label association; preview images have alt text = slot label ("Logo", "Signature", "Stamp").

### TC-SALES-12 — e-Tax submit — FLAGGED: no UI surface exists
- **Target**: App @ :5173 (none — see flag)
- **Persona**: `sales.etax.submit` (catalog permission exists)
- **Preconditions**: —
- **Priority**: high-risk
- **Steps**:
  1. Search the sales screens (documents editor, payments, worklist row actions) for any e-Tax submit control.
- **Expected**:
  1. **Blocked / flagged gap**: `useSubmitEtaxMutation` exists in `apps/web/src/sales/queries.ts` (POST `submitEtax`, 202 job with no status endpoint) and the catalog defines `sales.etax.submit`, but **no screen or button invokes it** — the flow is untestable from the UI today. File as a missing feature hook-up; when it lands, this case should cover: gated submit control (disabled + "Requires sales.etax.submit" tooltip for others), job toast lifecycle, and the non-authoritative-stub disclaimer.
- **Automation notes**: keep this case as a canary — automation should assert the control's *absence* today so the suite notices (and this case gets rewritten) the moment the button ships.
