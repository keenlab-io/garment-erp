# Production Tracking (M4) — UAT acceptance script

Business acceptance script for the Production module: the work-order list, the production
timeline, the locked-down shop-floor scan station, defect reporting, subcontracting, delay
alerts, the WIP board, and offline scanning. Written for the people who will run it — the
production lead and a floor operator — in plain business language. Engineer setup and the
QA-level test catalog live in `docs/testing/`
([UI_TEST_PLAN.md §Quickstart](../../testing/UI_TEST_PLAN.md) for environment bring-up,
[test-cases/02-production.md](../../testing/test-cases/02-production.md) for the selector-level
cases) — this script cross-links to them and does not repeat them.

**Coverage checklist**

- [ ] Orientation: work-order list and production timeline open and read sensibly (UAT-PROD-01)
- [ ] Golden path: create a work order and scan it Pending → In progress → Completed (UAT-PROD-02)
- [ ] Role acceptance: the Floor operator sees only the scan station; the kiosk is locked down (UAT-PROD-03)
- [ ] High-risk: a defect reported on the floor reaches the supervisor (UAT-PROD-04)
- [ ] High-risk: subcontract a step — Sent → Received, and Overdue past its SLA (UAT-PROD-05)
- [ ] High-risk: a step running over standard time raises a delay flag; the WIP board shows load (UAT-PROD-06)
- [ ] High-risk: scans made offline queue up and sync on reconnect (UAT-PROD-07)

**Role provisioning (read first).** The system ships with only the Super Admin account. The
Production lead and Floor operator roles used below must first be created by the Super Admin —
role plus user in Admin & Access, per the bundles in the UAT_PLAN roles table — then signed in.
That provisioning is scenario **UAT-ADMIN-02** in the Admin script and is a prerequisite for every
role-based scenario here.

**Routing-template prerequisite (flagged gap).** A work order is built from a *routing template*
— the ordered list of production steps with their standard minutes. There is **no screen to create
one**: IT must load at least one routing template before the session (see the flag in
[TC-PROD-02](../../testing/test-cases/02-production.md)). For UAT-PROD-06, ask IT to include one
step with a deliberately short standard time (e.g. 1 minute) so the delay flag can be provoked
within the session. The work-order form also asks for the finished item by its system identifier —
there is no item picker there (flagged usability gap; take the identifier from the Inventory item
detail).

---

### UAT-PROD-01 — The lead can see the shop's workload at a glance
- **Business role**: Production lead
- **Business goal**: confirm the two supervision views — the work-order list and the timeline —
  open and present the plant's workload readably.
- **Preconditions / test data**: signed in as the Production lead (UAT-ADMIN-02). On a fresh
  system with no work orders yet, the empty states are what is accepted; re-check after
  UAT-PROD-02 for populated rows.
- **Steps**:
  1. Open **Production → Work orders** from the menu and read the list.
  2. Open **Production → Timeline** and read it on a desktop-sized screen.
- **Expected result**:
  1. The work-order list shows one row per order with its work-order number, due date, how many
     steps are done (e.g. `0/4`), and a status chip. A fresh system says plainly there are none
     yet.
  2. The timeline shows one row per work order with its steps laid out as bars, plus an **Alerts**
     rail (reading "no active alerts" when nothing is delayed).
- **Acceptance criterion**: a production lead can open both supervision views and immediately read
  what is in the shop, what is due when, and whether anything is alerting.
- **Traces to**: brief §4 M4 UX lines — the timeline and work-orders screens for the lead persona;
  alert content is accepted in UAT-PROD-06.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-PROD-02 — Golden path: a work order goes Pending → In progress → Completed through floor scans
- **Business role**: Production lead (creates the order) + Floor operator (scans it through)
- **Business goal**: run one order through its whole life: office creates it, the floor works it
  step by step with Start/Finish scans, and the order completes itself when the last step is done.
- **Preconditions / test data**: a routing template loaded (see the flagged prerequisite above); a
  finished item registered in Inventory and its identifier at hand. Note the **work-order number**
  after creation — it is what the floor scans (in production it is printed on the traveler card).
- **Steps**:
  1. As the lead, open **Work orders → New work order**: pick the routing template, enter the
     finished item's identifier, quantity `50`, a near-future due date, and the product type.
     Review and create.
  2. Read the new order's status and its steps-done count.
  3. As the Floor operator at the **Scan station**, first scan a made-up code (e.g. `XX-000`).
  4. Scan the real work-order number. Read the card that appears, then tap **Start**.
  5. As the lead, check the order's status on the work-order list or timeline.
  6. Back at the scan station, re-scan the number and tap **Finish**. Repeat scan → Start →
     Finish for every remaining step, then scan once more after the last step is finished.
- **Expected result**:
  1. The order is created with a system-generated work-order number and status **Pending**, steps
     done `0/N`.
  2. Step 3: an unknown code is rejected with a clear "no work order found for this code" message —
     no accidental postings.
  3. Step 4: scanning brings up a card with the order number, item and quantity, and the current
     step with its standard minutes; tapping Start confirms and returns focus for the next scan.
  4. Step 5: the order's status is now **In progress** — the first Start moved it out of Pending
     without anyone touching the office screens.
  5. Each Finish completes the current step and the next scan lands on the following step; the
     steps-done count climbs.
  6. After the final step is finished, the order's status is **Completed**, and a further scan says
     plainly there is no step left to scan.
- **Acceptance criterion**: the order transitions Pending → In progress on the first Start scan and
  → Completed when the last step is finished — driven entirely from the floor, visible immediately
  to the lead.
- **Traces to**: BACKEND_SPEC M4 §4.7 — "Scan START on 'Sew' ⇒ step IN_PROGRESS, timer running";
  and "Completing the final step ⇒ WO COMPLETED and exactly one (idempotent) backflush in M3."
  (The backflush half is only observable in the Inventory stock card and needs a bill of materials
  on the finished item; if none is set up in this run, record that half as **Not tested here —
  covered by the integration layer** in the matrix rather than passing it silently.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-PROD-03 — The Floor operator sees only the scan station, and the station is locked down
- **Business role**: Floor operator
- **Business goal**: confirm the shop-floor account is safe to leave on a shared station: it can
  scan and do nothing else, and the station screen offers no way to wander into the office system.
- **Preconditions / test data**: the Floor operator user from UAT-ADMIN-02 (its bundle is
  scan-only per the UAT_PLAN roles table).
- **Steps**:
  1. Sign in as the Floor operator and look at what navigation is offered.
  2. Open the **Scan station** and inspect the screen: look for any menu, sidebar, breadcrumb,
     search, or navigation control.
  3. Try the keyboard search/command shortcuts that work elsewhere in the app.
  4. Try to open the work-order list or the timeline by typing their address directly.
- **Expected result**:
  1. Production offers **only the Scan station** to this user — the timeline, work orders, WIP and
     subcontract screens are absent from every menu and from search, not greyed out.
  2. The scan station itself renders with **no navigation chrome at all** — just the scan field,
     the action card, and the offline badge, in a large touch-friendly layout. There is
     deliberately no in-app way to leave the station screen.
  3. The command/search shortcuts do nothing on the station.
  4. Direct addresses for office screens bounce the operator away rather than rendering.
- **Acceptance criterion**: signed in as the Floor operator, nothing beyond the scan station is
  reachable — by menu, by search, by shortcut, or by typed address — and the station screen shows
  no navigation chrome.
- **Traces to**: brief §4 M4 UX line — the scan station is "**kiosk + lockdown, no nav chrome**",
  gated to the scan-only floor persona (brief §3: "the locked-down kiosk persona").
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-PROD-04 — A defect reported on the floor reaches the supervisor
- **Business role**: Floor operator (reports) + Production lead (reviews)
- **Business goal**: a stitching problem found mid-step is captured at the station in a few taps
  and is visible to the supervisor against the right order.
- **Preconditions / test data**: a work order mid-run (UAT-PROD-02, before its final step).
- **Steps**:
  1. At the scan station, scan the work-order number and tap **Report defect**.
  2. Tap the defect-type tile **Bad stitch**, set the quantity to `3`, and submit.
  3. As the lead, open that work order's detail page and its **Defects** tab.
- **Expected result**:
  1. A tile picker appears with the defect types (misprint, bad stitch, wrong size, stain, torn,
     other); submitting is impossible until a tile is chosen.
  2. Submission confirms and the station returns to the scan flow — the operator is not stranded
     in a form.
  3. The lead sees the defect listed on the order: type **Bad stitch**, quantity **3**.
- **Acceptance criterion**: a defect entered in a few taps at the station appears, with correct
  type and quantity, on the supervisor's view of that order.
- **Traces to**: brief §4 M4 UX line — "operator scans traveler card WO number → START/FINISH taps
  **or report defect**" (the DEFECT branch of the step statuses).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-PROD-05 — Subcontract a step: Sent → Received, and Overdue past its promised date
- **Business role**: Production lead
- **Business goal**: send a step out to a subcontractor with a promised return date, see at a
  glance which subcontracts are on time and which are overdue, and bring the work back into the
  line on receipt.
- **Preconditions / test data**: a work order with an unfinished step (create a second order via
  UAT-PROD-02 steps if the first is completed).
- **Steps**:
  1. On the **Timeline**, click the step to open its panel; choose **Subcontract**, enter the
     vendor (e.g. `Siam Stitch Co.`) and a promised return date a few days out, and send.
  2. Open **Production → Subcontracts** and read the new row's promised-date indicator.
  3. Subcontract another step the same way, but set its promised return date **in the past**, and
     read its row.
  4. On the first row, choose **Receive**; then check the order's timeline.
- **Expected result**:
  1. Sending confirms; the step is marked as sent out, and its clock/SLA countdown starts.
  2. The subcontract list shows the row as **Sent** with a "due in …" indication of time remaining.
  3. The past-date row shows as **Overdue**, stating how far past the promise it is — overdue work
     is impossible to miss.
  4. Receiving flips the row to **Received**, the receive action disappears, and the step returns
     to the production line — the order's timeline continues from where it left off without any
     manual repair.
- **Acceptance criterion**: a subcontract walks Sent → Received (or shows Overdue past its promised
  date), and receipt automatically returns the step to the line.
- **Traces to**: BACKEND_SPEC M4 §4.7 — "Subcontract a step ⇒ OUTSOURCED + SLA countdown; receive
  ⇒ timeline continues automatically."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-PROD-06 — A step running over its standard time raises a delay flag the lead can see
- **Business role**: Production lead (observing) + Floor operator (starts the step)
- **Business goal**: the shop does not rely on someone noticing a slow step — the system flags it,
  and the load board shows where the bottleneck is.
- **Preconditions / test data**: a work order whose routing includes the deliberately short
  standard-time step (see the routing-template prerequisite above). Keep the timeline open while
  the step runs.
- **Steps**:
  1. At the scan station, Start the short-standard step, and let it run past its standard minutes
     without finishing it.
  2. As the lead, watch the **Timeline** and its **Alerts** rail.
  3. Open **Production → WIP** and read the board.
- **Expected result**:
  1. Once the step exceeds its standard time, the timeline flags that step as **delayed** and the
     Alerts rail lists it, naming the step and the standard it is running over — this is the
     supervisor notification, on screen without anyone reloading.
  2. Clicking the alert opens the step's panel so the lead can act (hold, reassign, subcontract).
  3. The WIP board shows a card per department with its count of in-progress steps, and a delayed
     count on departments with flagged steps; the most-delayed department is listed first.
- **Acceptance criterion**: exceeding a step's standard time visibly flags the step as delayed on
  the timeline and raises an alert the lead can act on, and the WIP board reflects the load.
- **Traces to**: BACKEND_SPEC M4 §4.7 — "exceeding standard_time ⇒ delay emitted, supervisor
  notified, step flagged delayed in the timeline."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-PROD-07 — Scans made offline queue up and sync when the connection returns
- **Business role**: Floor operator
- **Business goal**: a Wi-Fi drop on the floor must not lose work — Start/Finish scans keep being
  accepted, queue visibly, and post themselves once the connection is back.
- **Preconditions / test data**: a work order with at least two unfinished steps; a way to cut the
  station's network (airplane mode / unplug) and restore it. Coordinate with IT if needed.
- **Steps**:
  1. At the scan station, **disconnect the network**.
  2. Scan the order and tap **Start**; re-scan and tap **Finish**.
  3. Read the badge on the station screen.
  4. **Reconnect** and watch the badge; then, as the lead, check the order's steps on the timeline
     or detail page.
- **Expected result**:
  1. Both actions are still accepted at the station while offline — the operator keeps working.
  2. The badge states the station is offline with **2 scans queued**.
  3. On reconnect the badge shows the queue syncing and then clears; the two scans post in order
     and the step shows as completed on the lead's view — nothing was lost, nothing posted twice.
- **Acceptance criterion**: Start/Finish scans made offline are visibly queued and post correctly,
  in order, on reconnect.
- **Traces to**: brief §4 M4 UX line — "Offline queue buffers scans, syncs on reconnect."
  **Honesty note (flagged scope limit):** only Start/Finish scans are offline-safe — defect
  reports and subcontract actions fail outright while offline (see the flags in
  [TC-PROD-07](../../testing/test-cases/02-production.md)). If the business expects offline defect
  capture too, record that as a gap, not a UAT failure.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence
