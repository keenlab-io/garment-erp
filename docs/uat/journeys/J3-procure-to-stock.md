# Journey J3 — Procure to Stock (Warehouse-led)

From a supplier's delivery truck to a trustworthy stock figure: this journey walks the Inventory
& Costing module (M3) through receiving goods with their true landed cost, then proving the
count-and-correct loop that keeps the book quantity honest. The story: the warehouse takes
delivery of a **20 kg roll of white fabric** plus a box of thread, with a ฿300 freight charge
that must be spread across the delivery so item costs reflect what the goods really cost to get
here. Later, a physical stock count finds only 18 kg of the fabric on the shelf — the system
drafts the correcting adjustment itself, a supervisor approves it under guard, and the books
move to match reality. Finally we prove no stock adjustment can ever be made without a reason.

**Coverage checklist**

- [ ] Items on file for receiving — fabric (KG) and thread (PCS) (UAT-J3-01)
- [ ] Goods receipt with landed-cost allocation — Draft → Confirmed → Posted; on-hand shows 20 kg (UAT-J3-02)
- [ ] Stock count — Open → Counting → Reconciled; variance auto-drafts an adjustment (UAT-J3-03)
- [ ] Adjustment approved under guard and posted — Draft → Approved → Posted; on-hand corrected to 18 kg (UAT-J3-04)
- [ ] Adjustment without a reason is blocked (UAT-J3-05)

**Run as one continuous session.** Stock counts and adjustments are session-only screens: once
created, they cannot be re-fetched after a page reload or a new sign-in. Do **not** log out or
reload the page between UAT-J3-03 and UAT-J3-05 — if the session is interrupted, restart from
UAT-J3-03 with a fresh count. (Items, receipts, lots, and the posted ledger persist normally.)

**Who runs it.** Written from the Warehouse staff point of view, but executed as the seeded
super-admin in one sign-in (see the roles table and bootstrap caveat in
[../UAT_PLAN.md](../UAT_PLAN.md)) — note the adjustment approval is a guarded action, and cost
columns are visible only to users with costing rights (the Warehouse staff bundle deliberately
excludes them; that masking is verified in the Inventory module script). Environment bring-up:
see [`docs/testing/UI_TEST_PLAN.md` §Quickstart](../../testing/UI_TEST_PLAN.md).

Status names used below are the system's real lifecycle states — goods receipt: DRAFT →
CONFIRMED → POSTED; stock count: OPEN → COUNTING → RECONCILED (→ ADJUSTED once the adjustment
posts); stock adjustment: DRAFT → APPROVED → POSTED.

---

### UAT-J3-01 — Items on file, ready to receive
- **Business role**: Warehouse staff
- **Business goal**: Set up the two purchased items so the delivery can be received against
  them.
- **Preconditions / test data**: Signed in; the seed contains the "Main Warehouse" and the
  units of measure (PCS, KG, M, ROLL) but no items — this scenario creates them.
- **Steps**:
  1. Open **Inventory → Items** and create item one: name **Fabric Roll — White**, type **Raw
     material**, base unit **KG**, costing method **Moving average (MAV)**.
  2. Create item two: name **Polyester Thread**, type **Raw material**, base unit **PCS**,
     costing method **Moving average (MAV)**.
- **Expected result**:
  1. Each item is created with a system-generated item code (AA-series) and appears in the item
     list with its type, base unit, and costing method.
  2. Neither item shows any stock on hand yet.
- **Acceptance criterion**: Both items exist with the correct base units (KG and PCS) and MAV
  costing, and zero on-hand.
- **Traces to**: M3 item-onboarding workflow — "create item (code, name, type, base UOM, costing
  method)" (verified workflow; journey prerequisite — no dedicated §3.8 bullet).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J3-02 — Delivery received with landed cost; 20 kg lands on hand
- **Business role**: Warehouse staff
- **Business goal**: Receive the supplier delivery so stock and item costs include the freight
  actually paid.
- **Preconditions / test data**: The two items from UAT-J3-01; the seeded Main Warehouse.
- **Steps**:
  1. Open **Inventory → Receipts** and start a new goods receipt into Main Warehouse.
  2. Add two lines: **Fabric Roll — White, 20 KG at ฿100/kg** (line value 2,000.00) and
     **Polyester Thread, 10 PCS at ฿100 each** (line value 1,000.00).
  3. On the landed-cost step, add a freight cost of **฿300** and choose to allocate it **by
     value**. (Note the wizard also offers allocation by weight and by quantity — switching the
     method redistributes the ฿300 across the lines.)
  4. Review the receipt, then **Confirm** it.
  5. **Post** the confirmed receipt.
  6. Open the fabric item's stock information and read its quantity on hand.
- **Expected result**:
  1. The draft receipt shows a **Draft** status chip while being built.
  2. With by-value allocation, the ฿300 freight is split in proportion to line value —
     **฿200 to the fabric line and ฿100 to the thread line** (a 2,000 : 1,000 split).
  3. After Confirm: the status chip reads **Confirmed**. After Post: **Posted** — posting is
     what creates the stock lots and the incoming ledger entries.
  4. The fabric item now shows **20 KG on hand** (and the thread 10 PCS) — the receipt is
     reflected in stock immediately on posting, as a 20 kg lot.
- **Acceptance criterion**: The posted receipt puts exactly 20 KG of fabric on hand as a
  received lot, with the ฿300 freight allocated 200/100 across the two lines by value.
- **Traces to**: BACKEND_SPEC M3 §3.8 — "Receive a 20kg roll, issue 5kg ⇒ lot
  qty_remaining=15, ledger IN 20 & OUT 5, qty_on_hand=15." (This journey verifies the receiving
  half — IN 20, on-hand 20; the issue half is covered by the Inventory module script's goods-issue
  scenario. Ledger-row internals are backend detail; the UI evidence is the on-hand figure.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J3-03 — Physical count finds 18 kg; the system drafts the correction itself
- **Business role**: Warehouse staff
- **Business goal**: Run a stock count and have the system prepare the correcting adjustment for
  the shortfall it finds.
- **Preconditions / test data**: UAT-J3-02 posted (fabric on hand: 20 KG). **Same continuous
  session from here through UAT-J3-05** — counts and adjustments cannot be reopened after a
  reload.
- **Steps**:
  1. Open **Inventory → Counts** and open a new stock count for Main Warehouse covering the
     fabric item; note its status.
  2. Begin counting and enter the physically counted quantity: **18 KG** (2 kg less than the
     books say).
  3. Reconcile the count.
- **Expected result**:
  1. The new count opens with an **Open** status chip, and moves to **Counting** once counting
     begins, showing the system quantity (20) alongside the entry for the counted quantity.
  2. After reconciling: the count's status chip reads **Reconciled**, and the fabric line shows
     a variance of **−2 KG** (counted 18 vs on-hand 20).
  3. The reconcile automatically drafts a stock adjustment for the −2 KG variance — it appears
     under **Inventory → Adjustments** with a **Draft** status chip, linked to the count. No
     stock has changed yet; on-hand still reads 20 KG.
- **Acceptance criterion**: Reconciling the count produces a Draft adjustment for exactly
  −2 KG of fabric without anyone keying it manually, and stock is untouched until that
  adjustment is approved and posted.
- **Traces to**: M3 count workflow — "StockCountStatus OPEN → COUNTING → RECONCILED → ADJUSTED
  → CLOSED; reconcile auto-drafts an adjustment" (verified workflow; the reason/audit criterion
  attaches to UAT-J3-04/-05).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J3-04 — Adjustment approved under guard and posted; the books now say 18 kg
- **Business role**: Warehouse staff (supervisor with approval rights)
- **Business goal**: Approve the counted shortfall so the recorded stock matches what is really
  on the shelf.
- **Preconditions / test data**: The Draft −2 KG adjustment from UAT-J3-03, in the same
  uninterrupted session.
- **Steps**:
  1. On the Draft adjustment, ensure a reason is recorded (e.g. "Cycle count variance —
     2 kg shrinkage"), then **Approve** it. Complete the guarded confirmation deliberately —
     approving a stock adjustment is a protected action.
  2. **Post** the approved adjustment.
  3. Re-open the fabric item's stock information and read the quantity on hand.
- **Expected result**:
  1. The approval asks for explicit confirmation before proceeding; after confirming, the
     adjustment's status chip reads **Approved**.
  2. After posting: the status chip reads **Posted**, and the originating stock count moves on
     to **Adjusted**.
  3. The fabric item's on-hand quantity now reads **18 KG** — the books match the shelf.
- **Acceptance criterion**: The guarded approval and posting reduce fabric on-hand from 20 KG to
  exactly 18 KG, with the adjustment's reason on record.
- **Traces to**: BACKEND_SPEC M3 §3.8 — "Adjustment without reason ⇒ 400; with reason ⇒ one
  audit_log row (actor + reason + before/after)." (The with-reason half: the audit row itself is
  verified via the Admin audit log / backend tests; the UI evidence here is the reasoned,
  guarded approval and the corrected on-hand figure.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J3-05 — No adjustment without a reason
- **Business role**: Warehouse staff
- **Business goal**: Prove stock can never be adjusted silently — every manual correction must
  say why.
- **Preconditions / test data**: Same uninterrupted session; the fabric item from this journey
  (any item with stock will do).
- **Steps**:
  1. Open **Inventory → Adjustments** and start a **manual** adjustment on the fabric item for
     any small quantity (e.g. −1 KG), leaving the **reason blank**.
  2. Attempt to submit it.
  3. Now enter a reason (e.g. "Damaged in handling") and submit again.
- **Expected result**:
  1. With the reason blank, the adjustment cannot be submitted — the screen blocks it and
     indicates the reason is required. Nothing is recorded and stock is unchanged.
  2. With a reason entered, the same adjustment submits normally and appears as a **Draft**
     adjustment awaiting the guarded approval (it may be left unapproved — the block is the
     point of this scenario).
- **Acceptance criterion**: A reason-less stock adjustment is impossible to submit; adding a
  reason is the only way through.
- **Traces to**: BACKEND_SPEC M3 §3.8 — "Adjustment without reason ⇒ 400; with reason ⇒ one
  audit_log row (actor + reason + before/after)." (The without-reason half; the 400 is verified
  in the UI as the blocked submit with a required-reason message.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:
