# Sales (M5) — UAT acceptance script

Business acceptance script for the Sales module: the documents worklist, the quotation → invoice
lifecycle, Thai-tax behaviour (VAT included/added/none, withholding tax and net-to-receive,
PromptPay QR), payments and receipts, voiding, customers, and AR aging. Written for the people who
will run it — sales staff and the accountant — in plain business language. The **full order-to-cash
lifecycle is journey [J1](../journeys/J1-order-to-cash.md)**; this script keeps to module-specific
acceptance so the two do not duplicate each other. Engineer setup and the QA-level test catalog
live in `docs/testing/` ([UI_TEST_PLAN.md §Quickstart](../../testing/UI_TEST_PLAN.md) for
environment bring-up, [test-cases/03-sales.md](../../testing/test-cases/03-sales.md) for the
selector-level cases).

**Coverage checklist**

- [ ] Orientation: the documents worklist opens and filters read sensibly (UAT-SALES-01)
- [ ] Golden path: quotation → invoice, each action offered only at the right status (UAT-SALES-02)
- [ ] Role acceptance: Sales staff vs Accountant vs a user with no sales access (UAT-SALES-03)
- [ ] High-risk: VAT added on top vs included in price vs no VAT — the numbers (UAT-SALES-04)
- [ ] High-risk: withholding tax and the net-to-receive figure (UAT-SALES-05)
- [ ] High-risk: the PromptPay QR appears only once the invoice is issued (UAT-SALES-06)
- [ ] High-risk: partial then full payment; the receipt is issued on the clearing payment (UAT-SALES-07)
- [ ] High-risk: voiding is guarded, and refused once a receipt exists (UAT-SALES-08)
- [ ] Customers: register, find, and reuse in the document editor (UAT-SALES-09)
- [ ] AR aging: overdue money lands in the right bucket (UAT-SALES-10)
- [ ] e-Tax submission — **Not UAT-testable via the UI** (UAT-SALES-11)

**Role provisioning (read first).** The system ships with only the Super Admin account. The Sales
staff and Accountant roles used below must first be created by the Super Admin — role plus user in
Admin & Access, per the bundles in the UAT_PLAN roles table — then signed in. That provisioning is
scenario **UAT-ADMIN-02** in the Admin script and is a prerequisite for every role-based scenario
here.

**One-sitting rule (flagged product gap, not a tester error).** The documents worklist and the
payments screen only show documents touched **in the current session**. Documents are saved
server-side, but after a page reload the screens cannot re-list them. Run each scenario start to
finish in one continuous sitting, don't add "reload and check it's still listed" steps, and note
that a document created by one user is not visible in another user's worklist.

---

### UAT-SALES-01 — The sales worklist opens and reads sensibly
- **Business role**: Sales staff
- **Business goal**: confirm the day-to-day working screen — one list of quotations and invoices
  with their statuses, aging, and totals — opens and can be narrowed down.
- **Preconditions / test data**: signed in as Sales staff (UAT-ADMIN-02). A fresh session starts
  empty (one-sitting rule); re-check the populated view after UAT-SALES-02.
- **Steps**:
  1. Open **Sales → Documents** from the menu.
  2. Read the toolbar: the quotation/invoice type filter, the status filter, the customer search,
     and the date filter.
  3. After UAT-SALES-02, re-read the list.
- **Expected result**:
  1. The worklist shows a "no documents yet" message in a fresh session — with a prompt to create
     one, not an error.
  2. Filters are present and labelled in business terms (quotations vs invoices, status, customer,
     date).
  3. Once documents exist in the session, each row shows the document number, customer, status
     chip, aging indicator, grand total, and date.
- **Acceptance criterion**: a sales user can open one worklist covering both quotations and
  invoices and narrow it by type, status, customer, and date.
- **Traces to**: brief §4 M5 UX lines — the unified documents worklist for the sales personas
  (session-only listing acknowledged as a flagged gap, brief §6).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-02 — Golden path: quotation → invoice, each action offered only at the right moment
- **Business role**: Sales staff
- **Business goal**: take one deal from quotation to issued invoice, and confirm the system only
  ever offers the next legitimate action for the document's current status — nobody can issue what
  isn't approved or convert what isn't ready.
- **Preconditions / test data**: a customer (UAT-SALES-09) and an inventory item. One continuous
  sitting. *(The full order-to-cash run through payment and receipt is journey J1 — do not repeat
  it here.)*
- **Steps**:
  1. Create a new document, type **Quotation**: pick the customer, add a line (e.g. 2 × 500),
     set a valid-until date. Watch the paper preview on the right as you type. Create it.
  2. Read the document header, then click **Send**, and then **Approve**, reading the status chip
     after each.
  3. Click **Convert to invoice**.
  4. On the invoice, click **Issue**.
  5. Go back to the original quotation and look for any further convert action.
- **Expected result**:
  1. The paper preview updates live and shows the bilingual document title ("ใบเสนอราคา /
     Quotation"), the customer's bill-to details, the lines, and totals. Creation is impossible
     until a customer and at least one complete line exist. On create, the quotation gets a
     system number in the quotation series (VAT and non-VAT quotations draw from different number
     series) and the chip reads **Draft**. The document becomes read-only after creation — the only
     offered actions are the lifecycle ones (**flagged gap:** there is no post-create editing).
  2. Send flips the chip to **Sent**; Approve flips it to **Approved**. At each status, only the
     actions valid for that status are offered.
  3. Convert produces an invoice with the **identical lines and prices**, carrying its own invoice
     number; the quotation's chip now reads **Converted**.
  4. Issue flips the invoice to **Issued** (and the PromptPay block appears — accepted in
     UAT-SALES-06).
  5. The converted quotation offers **no second convert** — the action is gone.
- **Acceptance criterion**: the quotation walks Draft → Sent → Approved → Converted and the invoice
  Draft → Issued, with only status-appropriate actions ever offered, and the converted invoice's
  lines match the quotation exactly.
- **Traces to**: BACKEND_SPEC M5 §5.8 — "Convert from APPROVED quotation ⇒ invoice with identical
  lines/prices; quotation CONVERTED; second convert ⇒ 409." (The 409 itself is a backend guard;
  the UI-observable proxy accepted here is that no second convert action exists. The related §5.8
  criteria on over-invoicing a quotation's subtotal and duplicate-free document numbering are
  backend/integration checks — record them as such in the matrix.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-03 — Three-way role acceptance: Sales staff, Accountant, and no sales access
- **Business role**: Sales staff + Accountant + one non-sales user (e.g. the Floor operator)
- **Business goal**: confirm the separation of duties: sales can sell and collect, only the
  accountant can void, and everyone else sees no Sales module at all.
- **Preconditions / test data**: the three users from UAT-ADMIN-02 (bundles per the UAT_PLAN roles
  table); a customer and an item. Because of the one-sitting rule, each user works on documents
  created **in their own session**.
- **Steps**:
  1. As **Sales staff**: run the quotation → invoice path of UAT-SALES-02 and record a payment;
     then, on the payments screen, attempt to **Void** the issued invoice.
  2. As the **Accountant**: create and issue an invoice, then Void it with a reason (per
     UAT-SALES-08 step 2).
  3. As the **non-sales user**: look for Sales in the menu and in search; type a sales screen's
     address directly.
- **Expected result**:
  1. Sales staff can create, send, approve, convert, issue, and record payments — the daily job is
     unobstructed. The void, however, **cannot be completed**: the confirming control stays
     unavailable to this role, with an indication that voiding is restricted.
  2. The Accountant completes the void; the invoice's chip flips to **Void** (rendered muted and
     struck through).
  3. The non-sales user sees **no Sales section anywhere** — menu and search offer nothing, and a
     typed address bounces them away. Absent, not greyed out.
- **Acceptance criterion**: Sales staff can trade but not void; the Accountant can void; a user
  without sales duties cannot see or reach the module at all.
- **Traces to**: brief §4 M5 UX line — "Buttons permission-gated and appear per current status";
  role bundles per brief §3. **Flag for product review:** the permission catalog defines a separate
  invoice-approval right that no screen currently exercises (see the flag in
  [TC-SALES-03](../../testing/test-cases/03-sales.md)) — do not assert behaviour on it.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-04 — VAT: added on top, included in the price, or none — the numbers must be exact
- **Business role**: Accountant
- **Business goal**: prove the three Thai VAT treatments compute to the satang, because these
  totals go on tax documents.
- **Preconditions / test data**: a customer and an item; VAT rate is 7%. Work on a new quotation
  with one line: quantity 2 × unit price 500 (line total 1,000.00).
- **Steps**:
  1. With VAT **added on top** (exclusive — "Vat Nok", the default), read Subtotal / VAT / Grand
     total in the paper preview.
  2. Switch to VAT **included in the price** (inclusive — "Vat Nai"); re-read the three figures.
  3. Switch to **Non-VAT**; re-read.
  4. Set it back to VAT-added, create the quotation, and compare the saved document's totals with
     step 1.
- **Expected result**:
  1. **Added on top**: Subtotal 1,000.00 / VAT 70.00 / Grand total **1,070.00**.
  2. **Included**: Grand total 1,000.00 / Subtotal 934.58 / VAT 65.42 — the VAT is backed out of
     the price, and subtotal + VAT re-sum to the grand total exactly.
  3. **Non-VAT**: Subtotal 1,000.00 / VAT 0.00 / Grand total 1,000.00 — and a non-VAT document
     draws its number from the separate non-VAT quotation series.
  4. The saved totals are identical to the on-screen preview — any drift between preview and saved
     document is a release-blocking failure.
- **Acceptance criterion**: all three VAT treatments produce exactly the figures above, on screen
  and on the saved document.
- **Traces to**: BACKEND_SPEC M5 §5.8 — "Vat Nok line ฿100 ⇒ subtotal 100, VAT 7, grand 107. Vat
  Nai ฿107 ⇒ subtotal 100, VAT 7 (back-out)." (scaled here to a 1,000.00 line).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-05 — Withholding tax: the net-to-receive figure the customer will actually transfer
- **Business role**: Accountant
- **Business goal**: on a services invoice where the customer withholds 3% tax, the system must
  state the withholding amount and the exact net the company should expect in the bank.
- **Preconditions / test data**: a customer and a service-type line. New invoice, one line of
  100,000.00, VAT added on top.
- **Steps**:
  1. Leave the withholding-tax rate empty and read the withholding panel.
  2. Enter a withholding rate of 3% and re-read the panel and the paper preview.
  3. Create the invoice and check the saved figures.
- **Expected result**:
  1. With no rate: the panel states there is no withholding, and net-to-receive equals the grand
     total.
  2. With 3%: Subtotal 100,000.00 / VAT 7,000.00 / Grand total 107,000.00; withholding shows
     **−3,000.00** (3% of the subtotal, not of the grand total); **Net to receive 104,000.00** —
     highlighted as the figure to reconcile the bank transfer against. The paper preview shows the
     same.
  3. The saved invoice carries identical figures. **Flagged usability gap:** the rate is typed as
     a fraction (`0.03` for 3%) rather than picked as a percentage — note operator-error risk.
- **Acceptance criterion**: a 3% withholding on a 100,000.00 subtotal shows withholding 3,000.00
  and net-to-receive 104,000.00, consistently on screen and on the saved invoice.
- **Traces to**: BACKEND_SPEC M5 §5.8 — "Services invoice ฿100,000 + WHT 3% ⇒ certificate 3,000,
  expected net transfer 97,000 (+VAT per mode)." (with VAT added on top, 97,000 + 7,000 =
  104,000).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-06 — The PromptPay QR exists only once the invoice is issued
- **Business role**: Sales staff
- **Business goal**: nobody must be able to hand a customer a payment QR for a draft — the QR may
  only exist for a formally issued invoice.
- **Preconditions / test data**: a draft invoice (e.g. from UAT-SALES-05, before issuing).
- **Steps**:
  1. On the **draft** invoice, look for the PromptPay block.
  2. Click **Issue**.
  3. Re-read the PromptPay block.
  4. Later, when recording a PromptPay payment against this invoice, note the reference field.
- **Expected result**:
  1. Draft: **no QR**. The block states plainly that the invoice must be issued before a QR is
     generated.
  2. After issuing: the block shows the QR image, a scan-to-pay hint, the invoice amount, and a
     payment **reference** to reconcile against.
  3. Recording a payment by PromptPay offers a reference field so the incoming transfer can be
     matched to the QR's reference.
- **Acceptance criterion**: no QR is available on a draft; issuing produces a QR carrying the
  invoice amount and a reconcilable reference.
- **Traces to**: brief §4 M5 UX line — the invoice "supports WHT rate + net-to-receive panel +
  **PromptPay QR once issued**".
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-07 — Partial then full payment; the receipt appears only on the clearing payment
- **Business role**: Sales staff
- **Business goal**: collect an invoice in two instalments and confirm the balance arithmetic and
  the moment the official receipt is produced.
- **Preconditions / test data**: an **issued** invoice for 1,070.00 in this session (UAT-SALES-04
  figures). One continuous sitting.
- **Steps**:
  1. Open **Sales → Payments** and select the invoice; read grand total, amount paid, and
     outstanding.
  2. Record a payment of `500`, method **Cash**.
  3. Record a second payment for the remaining outstanding (pre-filled `570`), method **Bank
     transfer**.
- **Expected result**:
  1. Before paying: grand total 1,070.00 / paid 0.00 / outstanding 1,070.00, with the payment
     amount pre-filled to the outstanding. Payment methods offered include bank transfer,
     PromptPay, cash, cheque, and credit card.
  2. After the partial payment: status **Partially paid**, paid 500.00, outstanding 570.00 — and
     **no receipt yet**.
  3. After the clearing payment: status **Paid**, outstanding 0.00, and a receipt block appears
     with the system receipt number and its issue date — the receipt is produced only by the
     payment that clears the invoice. (For a non-VAT invoice, the document produced is a plain
     receipt, never a tax invoice.)
- **Acceptance criterion**: partial payment yields Partially paid with correct arithmetic and no
  receipt; the clearing payment yields Paid, zero outstanding, and a numbered receipt.
- **Traces to**: brief §4 M5 UX line — "record full/partial …; full → PAID + issues
  receipt/tax-invoice …; partial → PARTIALLY_PAID". **Flagged verification limit:** the on-screen
  balance after payment is computed by the screen itself; the independent cross-check without
  reloading (one-sitting rule) is UAT-SALES-10 — the paid invoice must drop out of AR aging.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-08 — Voiding an invoice is guarded — and refused outright once a receipt exists
- **Business role**: Accountant
- **Business goal**: cancelling a tax document must demand a reason, and must be impossible once
  an official receipt has been issued against it.
- **Preconditions / test data**: in this session, (a) an **issued, unpaid** invoice and (b) a
  **paid** invoice with its receipt (UAT-SALES-07).
- **Steps**:
  1. On invoice (a), choose **Void**; in the confirmation, try to confirm with the reason blank.
  2. Type the reason `Customer cancelled order` and confirm.
  3. On invoice (b) — the one with a receipt — choose **Void**, enter a reason, and confirm.
- **Expected result**:
  1. The confirmation warns the void cannot be undone and **refuses to proceed with a blank
     reason** — nothing changes.
  2. With a reason, the void completes: the invoice's chip flips to **Void**, rendered muted and
     struck through, and it can no longer be paid. (Optional, Super Admin: the Admin audit log
     shows the void with its reason.)
  3. The void of the paid invoice is **refused** with a plain explanation that a receipt or tax
     invoice already exists for it — nothing changes on the invoice, the payment, or the receipt.
- **Acceptance criterion**: a void requires a typed reason; once a receipt exists the void is
  cleanly refused with an explanation and zero side effects.
- **Traces to**: BACKEND_SPEC M5 §5.8 — "Void after a receipt exists ⇒ 409; valid void writes
  audit_log (action=VOID, reason)." (the audit row's internals are covered by the integration
  layer; the UI spot-check is the Admin audit log entry).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-09 — Customers: register once, find anywhere
- **Business role**: Sales staff
- **Business goal**: register a customer with its Thai tax identity and reuse it instantly in
  search and in the document editor.
- **Preconditions / test data**: signed in; the seed ships no customers — this creates the first.
- **Steps**:
  1. Open **Sales → Customers** and create: name `Bangkok Textiles Co., Ltd.`, its 13-digit tax
     ID, branch code `00000`, credit terms `30` days, and an address.
  2. Search the list by a fragment of the name, then by the tax ID.
  3. Open the customer's detail page.
  4. In a new document's customer lookup, type the same name fragment and pick the customer.
- **Expected result**:
  1. Creation confirms; the list shows name, tax ID, branch, and credit terms (reading "30 days").
  2. Both searches — name fragment and tax ID — narrow the list to the customer.
  3. The detail page shows the profile, an AR-aging section (or "no outstanding balance"), and the
     session's documents for this customer.
  4. Picking the customer in the editor fills the document's bill-to block — name, tax ID, branch,
     address — on the paper preview, exactly as registered.
- **Acceptance criterion**: a customer registered once is findable by name and tax ID and its tax
  identity flows unchanged onto documents.
- **Traces to**: brief §4 M5 workflow step 1 — "**Create customer** (name, tax id, branch,
  address)."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-10 — AR aging: overdue money lands in the right bucket
- **Business role**: Accountant (Sales staff may also view)
- **Business goal**: see at a glance who owes what and how overdue it is, in the standard aging
  buckets.
- **Preconditions / test data**: in this session, one **issued, unpaid** invoice whose due date is
  in the past (create it with a past due date and issue it), plus the **paid** invoice from
  UAT-SALES-07.
- **Steps**:
  1. Open **Sales → AR aging** and read the summary strip and the table.
  2. Compare the overdue invoice's bucket here with the aging indicator on its worklist row.
  3. Change the as-of date to before the invoice's due date and re-read.
  4. Confirm the paid invoice from UAT-SALES-07 appears nowhere on this report.
- **Expected result**:
  1. Five buckets — Current, 1–30, 31–60, 61–90, 90+ days — each with a money total; the overdue
     invoice's amount sits in the bucket matching how many days overdue it is, and each bucket's
     strip total equals its column sum.
  2. The worklist row shows the **same** bucket for the same invoice — the two screens agree.
  3. Moving the as-of date earlier re-buckets the invoice toward Current (or out of the report).
  4. The paid invoice is absent — this is also the independent confirmation of UAT-SALES-07's
     balances.
- **Acceptance criterion**: an unpaid overdue invoice appears in exactly the right aging bucket,
  totals add up, and paid invoices drop out.
- **Traces to**: brief §4 M5 — "**OVERDUE** derived" (aging is the derived-overdue view of issued,
  unpaid invoices).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-SALES-11 — e-Tax submission — Not UAT-testable via the UI
- **Business role**: Accountant
- **Business goal**: submit an issued tax document to the e-Tax service — **this cannot currently
  be accepted through the UI**.
- **Preconditions / test data**: an issued invoice in this session.
- **Steps**:
  1. Look through the document editor, the worklist row actions, and the payments screen for any
     e-Tax submission control.
- **Expected result**:
  1. **No such control exists anywhere.** The capability is defined in the system's permission
     catalog (`sales.etax.submit`) but no screen offers it — the flow has no UI surface today.
- **Acceptance criterion**: none can be met — record this scenario as **Blocked / Not
  UAT-testable via UI** in the traceability matrix, and re-open it as a full scenario (gated
  control, submission confirmation) when the screen ships.
- **Traces to**: brief §6 — "**No-UI capabilities** (flag as Not-UAT-testable via UI): e-Tax
  submit (`sales.etax.submit`)"; see also the canary case
  [TC-SALES-12](../../testing/test-cases/03-sales.md).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence
