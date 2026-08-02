# Journey J1 — Order to Cash (Sales-led)

One customer, one quotation, one invoice, one receipt: the complete money-in lifecycle of the
Sales module (M5), from first recording the customer to holding the receipt for their final
payment. Along the way the journey proves the two calculations the business trusts the system
for — VAT (both the add-on and back-out modes) and 3% withholding tax — and shows the PromptPay
QR the customer would actually scan. The story: a new customer, **Bangkok Textiles Co., Ltd.**,
asks for a quote on a ฿100,000 printing service job; we quote them (VAT added on top), they
accept, we invoice with 3% withholding, they pay a deposit by transfer and settle the balance a
few days later, and the system hands us the receipt.

**Coverage checklist**

- [ ] Customer master record created (UAT-J1-01)
- [ ] Quotation drafted; VAT add-on (Excl.) and back-out (Incl.) arithmetic verified (UAT-J1-02)
- [ ] Quotation sent and approved — Draft → Sent → Approved (UAT-J1-03)
- [ ] Approved quotation converted to an invoice — Converted; lines carried over identically (UAT-J1-04)
- [ ] Invoice issued with 3% WHT — net-to-receive shown; PromptPay QR appears (UAT-J1-05)
- [ ] Partial payment recorded — invoice becomes Partially paid (UAT-J1-06)
- [ ] Final payment recorded — invoice Paid, receipt produced (UAT-J1-07)

**Run as one continuous session.** The sales worklist and the payments screen only show
documents touched in the current sign-in session. Do **not** log out, reload the page, or switch
browsers mid-journey — the documents remain safe on the server, but the screens cannot re-fetch
them and the journey cannot be resumed. If the session is interrupted, restart the journey from
UAT-J1-02 with a fresh quotation.

**Who runs it.** The journey is written from the Sales staff and Accountant point of view, but is
executed end-to-end as the seeded super-admin in a single sign-in (see the roles table and
bootstrap caveat in [../UAT_PLAN.md](../UAT_PLAN.md)). Role-by-role permission acceptance is
covered separately in the Sales module script. Environment bring-up: see
[`docs/testing/UI_TEST_PLAN.md` §Quickstart](../../testing/UI_TEST_PLAN.md).

Status names used below are the system's real lifecycle states — quotation: DRAFT → SENT →
APPROVED → CONVERTED; invoice: DRAFT → ISSUED → PARTIALLY_PAID → PAID.

---

### UAT-J1-01 — New customer on file
- **Business role**: Sales staff
- **Business goal**: Record a new customer so documents can be billed to them.
- **Preconditions / test data**: Signed in; fresh session. No customer data exists in the seed —
  this scenario creates it.
- **Steps**:
  1. Open **Sales → Customers** and choose to create a new customer.
  2. Enter name **Bangkok Textiles Co., Ltd.**, a 13-digit tax ID, branch code **00000**, credit
     terms **30 days**, and a billing address. Save.
  3. Search the customer list by a fragment of the name, and again by the tax ID.
- **Expected result**:
  1. A "Customer created" confirmation appears and the customer is listed with its name, tax ID,
     branch, and credit terms ("30 days").
  2. Both searches (name fragment and tax ID) find the customer.
  3. Opening the customer shows their profile details.
- **Acceptance criterion**: The customer exists and is findable by name and tax ID, with the tax
  details a Thai tax document requires (13-digit tax ID + branch).
- **Traces to**: M5 lifecycle step 1 — "Create customer (name, tax id, branch, address)"
  (verified workflow; journey prerequisite — no dedicated §5.8 acceptance bullet).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J1-02 — Quotation drafted with correct VAT arithmetic (add-on and back-out)
- **Business role**: Sales staff
- **Business goal**: Quote the customer ฿100,000 for a service job and prove the system computes
  VAT correctly in both calculation modes before committing to one.
- **Preconditions / test data**: UAT-J1-01 complete; at least one sellable item exists (create a
  simple service/finished item under **Inventory → Items** first if none does). Same session.
- **Steps**:
  1. From **Sales → Documents**, start a new document; keep the type as **Quotation** and pick
     **Bangkok Textiles Co., Ltd.** as the customer.
  2. **VAT check (add-on / "Excl.")**: add one line at quantity 1, unit price **100**. With VAT
     on and the calculation mode at **Excl.**, read Subtotal / VAT / Grand total from the paper
     preview.
  3. **VAT check (back-out / "Incl.")**: change the unit price to **107** and switch the
     calculation mode to **Incl.**; re-read the totals.
  4. Set up the real quotation: calculation mode back to **Excl.**, line description "Sublimation
     printing service", quantity 1, unit price **100,000**. Set a valid-until date in the future.
  5. Create the quotation.
- **Expected result**:
  1. The paper preview updates live as you type and shows the bilingual heading
     "ใบเสนอราคา / Quotation" with the customer in "Bill to".
  2. Step 2 (Excl., ฿100 line): **Subtotal 100.00, VAT 7.00, Grand total 107.00**.
  3. Step 3 (Incl., ฿107 line): **Grand total 107.00, Subtotal 100.00, VAT 7.00** — the VAT is
     backed out of the inclusive price, and subtotal + VAT re-sum to the grand total exactly.
  4. Step 5: a "Document created" confirmation; the quotation gets a document number (QV-series)
     and a **Draft** status chip; totals read **Subtotal 100,000.00 / VAT 7,000.00 /
     Grand total 107,000.00**.
- **Acceptance criterion**: Both VAT modes produce exactly the expected figures (100 ⇒ 107 added
  on; 107 ⇒ 100 + 7 backed out), and the saved quotation totals ฿107,000.00.
- **Traces to**: BACKEND_SPEC M5 §5.8 — "Vat Nok line ฿100 ⇒ subtotal 100, VAT 7, grand 107.
  Vat Nai ฿107 ⇒ subtotal 100, VAT 7 (back-out)."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J1-03 — Quotation sent to the customer and approved
- **Business role**: Sales staff (send), Accountant (approve)
- **Business goal**: Move the quotation through its commercial lifecycle to the point it can
  become an invoice.
- **Preconditions / test data**: The Draft quotation from UAT-J1-02, same session.
- **Steps**:
  1. On the quotation, choose **Send**.
  2. Then choose **Approve**.
- **Expected result**:
  1. After Send: a "Quotation sent" confirmation; the status chip reads **Sent**.
  2. After Approve: a "Quotation approved" confirmation; the status chip reads **Approved**.
  3. At each stage only the actions valid for the current status are offered (e.g. Approve is not
     offered while the quotation is still Draft).
- **Acceptance criterion**: The quotation advances Draft → Sent → Approved with the status chip
  confirming each step, and out-of-sequence actions are never offered.
- **Traces to**: M5 lifecycle — "DRAFT → Send → SENT → Approve → APPROVED" (verified workflow);
  establishes the APPROVED precondition of §5.8 — "Convert from APPROVED quotation ⇒ invoice
  with identical lines/prices…".
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J1-04 — Approved quotation converted to an invoice, lines carried over exactly
- **Business role**: Accountant
- **Business goal**: Turn the customer's accepted quotation into an invoice without re-keying
  anything.
- **Preconditions / test data**: The Approved quotation from UAT-J1-03, same session.
- **Steps**:
  1. On the approved quotation, choose **Convert to invoice**.
  2. Compare the new invoice's lines and totals against the quotation.
  3. Return to the quotation and check its status and available actions.
- **Expected result**:
  1. A "Converted to invoice" confirmation; the screen moves to the new invoice, whose paper
     preview now reads "ใบแจ้งหนี้ / Invoice" with a **Draft** status chip and an INV-series
     document number.
  2. The invoice carries the identical line ("Sublimation printing service", 1 × 100,000.00) and
     identical totals (107,000.00 grand) — nothing re-typed, nothing changed.
  3. The quotation's status chip now reads **Converted**, and the Convert action is no longer
     offered on it (it cannot be converted a second time).
- **Acceptance criterion**: The invoice is a faithful copy of the quotation's lines and prices,
  the quotation shows Converted, and a second conversion is not possible.
- **Traces to**: BACKEND_SPEC M5 §5.8 — "Convert from APPROVED quotation ⇒ invoice with
  identical lines/prices; quotation CONVERTED; second convert ⇒ 409." (The 409 is verified in
  the UI as the Convert action no longer being offered.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J1-05 — Invoice issued with 3% withholding: net-to-receive and PromptPay QR
- **Business role**: Accountant
- **Business goal**: Issue the invoice with 3% withholding tax so the expected bank transfer
  amount is known, and give the customer a PromptPay QR to pay with.
- **Preconditions / test data**: The Draft invoice from UAT-J1-04 (subtotal 100,000.00 / VAT
  7,000.00 / grand 107,000.00), same session.
- **Steps**:
  1. On the draft invoice, confirm no PromptPay QR is shown yet.
  2. Enter a withholding (WHT) rate of **3%** and read the withholding panel.
  3. Choose **Issue**.
  4. Inspect the PromptPay block on the issued invoice.
- **Expected result**:
  1. Before issuing, the PromptPay area explains the invoice must be issued first — no QR yet.
  2. The withholding panel shows: WHT **−3,000.00** (3% of the ฿100,000 subtotal — not of the
     grand total) and **Net to receive 104,000.00** (grand 107,000 − WHT 3,000; i.e. the spec's
     97,000 expected net plus the 7,000 VAT). The paper preview mirrors both figures.
  3. After Issue: an "Invoice issued" confirmation; the status chip reads **Issued**.
  4. The PromptPay block now shows a scannable QR image, the invoice amount, and a payment
     reference to reconcile the transfer against.
- **Acceptance criterion**: On a ฿100,000 service invoice the system shows a ฿3,000 withholding
  certificate amount and an expected net transfer of ฿104,000 (97,000 + VAT), and the PromptPay
  QR appears only once the invoice is Issued.
- **Traces to**: BACKEND_SPEC M5 §5.8 — "Services invoice ฿100,000 + WHT 3% ⇒ certificate
  3,000, expected net transfer 97,000 (+VAT per mode)."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J1-06 — Partial payment leaves the invoice partially paid
- **Business role**: Accountant
- **Business goal**: Record the customer's ฿50,000 deposit and see the outstanding balance
  tracked correctly.
- **Preconditions / test data**: The Issued invoice from UAT-J1-05 (grand total 107,000.00),
  same session.
- **Steps**:
  1. Open **Sales → Payments** and select the invoice; read its Grand total / Amount paid /
     Outstanding figures.
  2. Change the payment amount to **50,000**, method **Bank transfer**, and record the payment.
- **Expected result**:
  1. Before paying: Grand total 107,000.00 / Amount paid 0.00 / Outstanding 107,000.00, with the
     full outstanding pre-filled as the suggested amount.
  2. After recording: a "Payment recorded" confirmation; the status chip reads **Partially
     paid**; Amount paid 50,000.00; Outstanding **57,000.00**. No receipt is produced yet.
- **Acceptance criterion**: A partial payment moves the invoice to Partially paid with the
  outstanding balance reduced to exactly ฿57,000.00, and no receipt is issued for a partial
  payment.
- **Traces to**: M5 payments workflow — "record full/partial …; partial → PARTIALLY_PAID; full →
  PAID + issues receipt/tax-invoice" (verified workflow; no dedicated §5.8 bullet for payment
  states).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J1-07 — Final payment settles the invoice and produces the receipt
- **Business role**: Accountant
- **Business goal**: Record the settling payment and obtain the receipt that closes the order.
- **Preconditions / test data**: The Partially paid invoice from UAT-J1-06 (outstanding
  57,000.00), same session.
- **Steps**:
  1. On **Sales → Payments**, select the invoice again; the remaining **57,000** should be
     pre-filled.
  2. Record the payment, method **Bank transfer**.
  3. Return to **Sales → Documents** and read the final status of both documents.
- **Expected result**:
  1. A "Payment recorded" confirmation; the status chip reads **Paid**; Outstanding 0.00.
  2. A receipt block appears showing the receipt's own document number (RE-series) and its issue
     date — the receipt is produced only by this clearing payment.
  3. The worklist shows the quotation as **Converted** and the invoice as **Paid** — the full
     order-to-cash trail in one view.
- **Acceptance criterion**: The clearing payment moves the invoice to Paid with zero
  outstanding, and a numbered receipt is produced.
- **Traces to**: M5 payments workflow — "full → PAID + issues receipt/tax-invoice (ReceiptType
  …)" (verified workflow; receipt numbering per the seeded RE… sequence).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:
