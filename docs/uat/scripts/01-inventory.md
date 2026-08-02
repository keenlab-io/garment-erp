# Inventory & Costing (M3) — UAT acceptance script

Business acceptance script for the Inventory module: the item catalog, goods receipts with landed
cost, scan-based goods issues, stock counts, stock adjustments, and inventory reports. It is written
for the people who will run it — warehouse staff and the owner — in plain business language.
Engineer setup and the QA-level test catalog live in `docs/testing/`
([UI_TEST_PLAN.md §Quickstart](../../testing/UI_TEST_PLAN.md) for environment bring-up,
[test-cases/01-inventory.md](../../testing/test-cases/01-inventory.md) for the selector-level
cases) — this script cross-links to them and does not repeat them.

**Coverage checklist**

- [ ] Orientation: item catalog opens and a new material can be registered (UAT-INV-01)
- [ ] Golden path: goods receipt with landed cost — Draft → Confirmed → Posted (UAT-INV-02)
- [ ] Role acceptance: Warehouse staff see quantities, never cost figures (UAT-INV-03)
- [ ] High-risk: kiosk goods issue — scan, post, and the insufficient-stock stop (UAT-INV-04)
- [ ] High-risk: stock count — Open → Counting → Reconciled → Adjusted (UAT-INV-05)
- [ ] High-risk: manual adjustment — reason mandatory, approval guarded (UAT-INV-06)
- [ ] Verification: inventory reports agree with every movement posted above (UAT-INV-07)

**Role provisioning (read first).** The system ships with only the Super Admin account — the
Warehouse staff role used below does not exist until the Super Admin creates it: in Admin & Access,
create the role with the Warehouse-staff permission bundle from the UAT_PLAN roles table, create a
user assigned to it, then sign in as that user. That provisioning is itself scenario
**UAT-ADMIN-02** in the Admin script and is a prerequisite for every role-based scenario here.

**One-sitting rule (flagged product gap, not a tester error).** Stock counts and stock adjustments
are visible only within the session that created them — after a page reload the screens cannot
re-list them, even though the postings themselves are saved. Run UAT-INV-05 and UAT-INV-06
start-to-finish without reloading the page or signing out, and do not add "log out and check it is
still there" steps.

---

### UAT-INV-01 — Register a new material and find it in the catalog
- **Business role**: Warehouse staff (Super Admin on the very first run, before roles exist)
- **Business goal**: confirm the item catalog is usable — an operator can browse it and register a
  new raw material that is immediately findable.
- **Preconditions / test data**: signed in; the seeded system contains **no items**, so this
  scenario creates the first one. You will need the system identifier of a base unit (e.g. the
  kilogram unit) — there is **no unit picker** in the create form, the identifier is typed directly
  (flagged usability gap; ask IT for the value from the seeded unit list).
- **Steps**:
  1. Open **Inventory → Items** from the menu.
  2. Review the catalog table (item code, name, type, minimum stock, stock health).
  3. Choose **Create item**. Enter: name `UAT Fabric Roll`, type **Raw**, the base unit identifier
     (kilograms), costing method **Moving average**, standard cost `100`, minimum stock `10`.
  4. Submit, then open the new item's detail page from its row.
- **Expected result**:
  1. The catalog renders (on a fresh system it says there are no items yet — that is correct).
  2. A success confirmation appears and the item shows in the list with a **system-generated item
     code** (the tester does not invent codes).
  3. The detail page shows the values exactly as entered: name, type Raw, costing method, standard
     cost, minimum stock.
- **Acceptance criterion**: a warehouse user can register a new raw material and immediately find
  it in the catalog under a system-generated item code, with all entered attributes intact.
- **Traces to**: brief §4 M3 UX line — "**Item onboarding** — create item (code, name, type, base
  UOM, costing method)".
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-INV-02 — Receive purchased goods with freight spread over the lines (Draft → Confirmed → Posted)
- **Business role**: Warehouse staff (cost figures verified by Super Admin / Owner at the end —
  the warehouse role intentionally cannot see them, see UAT-INV-03)
- **Business goal**: book an incoming delivery so that both the quantity **and** the true landed
  cost (goods + freight) are on the books.
- **Preconditions / test data**: the item from UAT-INV-01; a supplier reference to record (there is
  no supplier catalog to pick from — the reference is typed free-form; flagged gap).
- **Steps**:
  1. Open **Inventory → Goods receipts** and start a **new receipt**.
  2. On the **Lines** step: enter the supplier reference, pick the `UAT Fabric Roll` item, quantity
     `20` (kilograms), unit price `100.00`.
  3. Continue to the **Landed cost** step: choose allocation **By value** and enter a freight /
     import total of `500.00`. Read the live allocation preview.
  4. Continue to **Review**, check the lines, and confirm creation of the receipt.
  5. On the receipts list, find the new receipt and choose **Post**.
  6. (Super Admin / Owner) Re-open the receipts list and read the landed-cost figures for the row.
- **Expected result**:
  1. The wizard will not let you continue with an incomplete line (item, unit, quantity and unit
     price are all required).
  2. The landed-cost preview shows the freight allocated to the line and the resulting **new unit
     cost of 125.00** (100.00 goods + 500.00 freight spread over 20 kg).
  3. After creation the receipt appears with status **Confirmed** (a receipt saved as a plain draft
     would instead show **Draft** and offer a Confirm action first).
  4. After Post the status becomes **Posted** — the stock is now on the books (verified in
     UAT-INV-07: 20 in, on-hand 20).
  5. The Super Admin / Owner can read the allocated landed cost and allocation method on the row;
     the Warehouse staff user sees those cells masked (that behaviour is accepted in UAT-INV-03).
- **Acceptance criterion**: a receipt walks Draft → Confirmed → Posted, the freight is visibly
  spread across the lines before confirming, and the posted quantity subsequently appears in stock.
- **Traces to**: BACKEND_SPEC M3 §3.8 — "Receive a 20kg roll, issue 5kg ⇒ lot qty_remaining=15,
  ledger IN 20 & OUT 5, qty_on_hand=15." (the receive half; the issue half is UAT-INV-04 and the
  ledger check is UAT-INV-07). Status flow per brief §4 M3: "DRAFT → CONFIRMED → POSTED".
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-INV-03 — Warehouse staff see quantities, never costs
- **Business role**: Warehouse staff
- **Business goal**: confirm cost confidentiality — the warehouse role can do its daily work with
  quantities while every monetary cost figure stays hidden from it.
- **Preconditions / test data**: the Warehouse staff user from UAT-ADMIN-02 (its bundle in the
  UAT_PLAN roles table deliberately excludes cost visibility); the posted receipt from UAT-INV-02.
- **Steps**:
  1. Sign in as the Warehouse staff user.
  2. Look at the navigation menu: note which Inventory screens are offered.
  3. Open the **Items** catalog and read the standard-cost column.
  4. Open **Goods receipts** and read the landed-cost column of the posted receipt.
  5. Open **Inventory → Reports → Valuation** and read the average-cost and value columns.
- **Expected result**:
  1. The menu offers only the inventory screens this role works with; screens the role has no
     business on (per its bundle) are absent entirely — not greyed out. Typing their address
     directly bounces the user away.
  2. Every cost cell — standard cost, landed cost, average cost, line value, total value — shows a
     masked placeholder (a lock with dots), **not** a number. The figure is not merely hidden from
     view; it is not delivered to this user at all.
  3. Quantity columns (on hand, received, minimum stock) remain fully visible — the role can still
     do its job.
- **Acceptance criterion**: signed in as Warehouse staff, no monetary cost figure is readable
  anywhere in the Inventory module, while all quantity information remains available.
- **Traces to**: brief §4 M3 UX line — "Landed-cost column masked without `inventory.cost.view`"
  (the Warehouse bundle is defined without that permission precisely so this is demonstrable).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-INV-04 — Kiosk goods issue: scan stock out; the system refuses to issue more than exists
- **Business role**: Warehouse staff
- **Business goal**: issue material to production by scanning item codes at a touch station, and
  prove the system stops an over-issue with a message that says exactly how much is left.
- **Preconditions / test data**: 20 kg of `UAT Fabric Roll` posted in UAT-INV-02; know the item's
  code (the scan resolves against the item code).
- **Steps**:
  1. Open **Inventory → Goods issues**. Note the screen switches to a large touch-friendly layout.
  2. Choose purpose **Production**.
  3. With nothing scanned yet, try to post the issue.
  4. Scan (or type and confirm) the item code with quantity `5`, then post the issue.
  5. Scan the same item again, set the quantity to `100` — far more than remains — and post.
- **Expected result**:
  1. Step 3: posting an empty issue is refused with a clear message; nothing is recorded.
  2. Step 4: each scan drops into a "last scans" list and the input clears itself ready for the
     next scan; posting succeeds with a confirmation — 5 kg leave stock (verified in UAT-INV-07).
  3. Step 5: the posting is refused with a plain-language message that states the **remaining
     quantity** (with 15 kg left, the message says only 15 remain — not a generic error). The
     scanned list is kept on screen so the operator can correct the quantity and retry without
     re-scanning.
- **Acceptance criterion**: an over-issue is blocked with the exact remaining quantity shown to the
  operator, and a corrected retry succeeds without starting over.
- **Traces to**: brief §4 M3 — "**Goods issue** (scan kiosk) … post → DRAFT → POSTED … 422
  insufficient stock shows remaining qty"; and BACKEND_SPEC M3 §3.8 — "Receive a 20kg roll, issue
  5kg ⇒ … ledger IN 20 & OUT 5, qty_on_hand=15." (the issue half).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-INV-05 — Stock count: Open → Counting → Reconciled → Adjusted
- **Business role**: Warehouse staff (its bundle includes adjustment approval)
- **Business goal**: run a periodic stock count, record counted quantities that differ from the
  system, and turn the differences into an approved, posted stock adjustment.
- **Preconditions / test data**: at least one item with posted stock (from UAT-INV-02/-04).
  **One-sitting rule applies** — complete this scenario without reloading the page.
- **Steps**:
  1. Open **Inventory → Stock counts**. Enter the counting period (e.g. this month) and pick the
     item(s) to count, then open the count.
  2. For each line, enter a **counted quantity** that differs from the system quantity (make at
     least one line an overage or shortage), then save the counts.
  3. Choose **Reconcile** and confirm the dialog after reading what it says will happen.
  4. In the drafted-adjustment section that appears, choose **Approve adjustment**; in the guarded
     confirmation, type a reason and confirm.
  5. Choose **Post adjustment**.
- **Expected result**:
  1. The count opens and each line is marked **locked for counting** — stock movement of a counted
     item is held while the count is open.
  2. The reconcile confirmation states plainly that it drafts a stock adjustment for the counted
     differences; after confirming, a drafted adjustment lists every variance with its signed
     quantity difference.
  3. Approval is a **guarded step**: the confirmation demands a typed reason and re-states the
     consequence before allowing it.
  4. After posting, the counted differences are on the books — the item's stock card and valuation
     reflect the new quantities (verified in UAT-INV-07).
- **Acceptance criterion**: a count walks Open → Counting → Reconciled → Adjusted; the variance
  becomes a posted adjustment only after a reasoned, guarded approval.
- **Traces to**: brief §4 M3 — "**Stock count → adjustment** — OPEN → COUNTING → RECONCILED →
  ADJUSTED …; reconcile auto-drafts an adjustment; … DRAFT → APPROVED → POSTED (guarded approve)".
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-INV-06 — Manual stock adjustment: no reason, no adjustment; approval is guarded
- **Business role**: Warehouse staff
- **Business goal**: write off damaged stock — and prove the system refuses an adjustment that has
  no stated reason, so every stock correction is accountable.
- **Preconditions / test data**: the item from UAT-INV-01 with stock on hand. **One-sitting rule
  applies.**
- **Steps**:
  1. Open **Inventory → Stock adjustments**.
  2. Leave the **reason blank**, pick the item, set the quantity change to `-2`, and try to create
     the adjustment.
  3. Now enter the reason `Damaged in storage` and create it again.
  4. Choose **Approve**; in the guarded confirmation, type the reason and confirm.
  5. Choose **Post**.
- **Expected result**:
  1. Step 2: creation is **blocked** with a message that a reason is required — nothing is recorded
     anywhere.
  2. Step 3: the adjustment is created as a **Draft** showing the reason and the −2 line.
  3. Step 4: approval opens a guarded confirmation (typed reason required, consequence stated);
     after confirming the status becomes **Approved**.
  4. Step 5: posting succeeds — status **Posted**; on-hand drops by 2 (verified in UAT-INV-07).
  5. (Optional, Super Admin) The Admin audit log shows the adjustment entry with who did it and the
     reason given.
- **Acceptance criterion**: an adjustment without a reason cannot even be created; with a reason it
  walks Draft → Approved → Posted, with approval behind a guarded, reasoned confirmation.
- **Traces to**: BACKEND_SPEC M3 §3.8 — "Adjustment without reason ⇒ 400; with reason ⇒ one
  audit_log row (actor + reason + before/after)." (the audit row is spot-checked via the Admin
  audit log; the row's internal shape is covered by the integration-test layer).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-INV-07 — The inventory reports agree with everything posted above
- **Business role**: Super Admin / Owner (full cost visibility; Warehouse staff sees the same
  reports with costs masked — accepted in UAT-INV-03)
- **Business goal**: confirm the reports tell the truth — every movement posted in this script is
  in the stock card, and the numbers add up.
- **Preconditions / test data**: UAT-INV-02 (receipt of 20), UAT-INV-04 (issue of 5), and the
  adjustments posted in UAT-INV-05/-06.
- **Steps**:
  1. Open **Inventory → Reports** and select the **Stock card** for `UAT Fabric Roll`.
  2. Read the ledger rows and the running balance.
  3. Switch to the **Valuation** report and read the item's row and the total-value line.
  4. Switch to **Low stock**: check whether the item appears, given its minimum stock of 10.
- **Expected result**:
  1. The stock card shows, in order: an opening balance, an **In of 20** referenced to the goods
     receipt, an **Out of 5** referenced to the goods issue, and the adjustment lines from
     UAT-INV-05/-06 — each movement posted in this script appears exactly once, none is missing.
  2. The running balance is arithmetically consistent on every row, and the closing balance equals
     opening + all In − all Out. (Before the adjustments, that is exactly 20 − 5 = **15 on hand**.)
  3. Valuation shows the item's on-hand quantity and value, and the report's total equals the sum
     of its rows.
  4. The item appears under Low stock only if its on-hand is at or below its minimum stock.
- **Acceptance criterion**: the stock card reproduces every posted movement with a consistent
  running balance, and valuation totals equal the sum of their rows.
- **Traces to**: BACKEND_SPEC M3 §3.8 — "Receive a 20kg roll, issue 5kg ⇒ lot qty_remaining=15,
  ledger IN 20 & OUT 5, qty_on_hand=15." (Related §3.8 criteria — moving-average math to the
  cent and "Replaying stock_movement … reproduces stock_balance exactly" — are backend/integration
  checks; the UI-observable proxy accepted here is the consistent stock card and matching totals.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence
