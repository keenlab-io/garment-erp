# Production (M4) — UI test cases

UI test cases for the Production module (`/production/*`): realtime Gantt timeline, work orders,
the lockdown scan-station kiosk (`/production/scan`), WIP board, and subcontract SLA tracking.
Screens live in `apps/web/src/router/routes/production/`; feature components in
`apps/web/src/production/components/`.

**Coverage checklist**

- [x] Smoke: timeline renders (TC-PROD-01)
- [x] Golden path: create work order → detail tabs (TC-PROD-02)
- [x] Permission gate: scan-only operator persona (TC-PROD-03)
- [x] High-risk: kiosk lockdown chrome stripping + Touch density (TC-PROD-04)
- [x] High-risk: traveler-card step scan START/FINISH loop (TC-PROD-05)
- [x] High-risk: defect tile capture (TC-PROD-06)
- [x] High-risk: offline scan queue — queue, badge, persist, flush (TC-PROD-07)
- [x] Step drawer: hold + subcontract send (TC-PROD-08)
- [x] Realtime pulse across two sessions (TC-PROD-09)
- [x] Subcontracts: SLA chip + receive (TC-PROD-10)
- [x] WIP board (TC-PROD-11)

**Persona setup note.** `VITE_DEV_PERMISSIONS` does **not** apply to the running app (unit tests
only) — limited personas are real users created via `/admin/roles` + `/admin/users` as
`superadmin`, then signed in. **Flagged test-data gap:** no seeded limited personas; also no
seeded routing template — golden paths must create one via the API (`createRoutingTemplate` has
no UI screen; see flag in TC-PROD-02).

---

### TC-PROD-01 — Timeline smoke: route loads and key elements render
- **Target**: App @ :5173 `/production/timeline`
- **Persona**: super-admin
- **Preconditions**: logged in; API up. With zero work orders the empty state is asserted instead of rows.
- **Priority**: smoke
- **Steps**:
  1. Navigate to `/production/timeline` (sidebar: Production → Timeline).
  2. Observe at desktop width (≥ md), then narrow the viewport below md.
- **Expected**:
  1. Heading "Production timeline"; an alert rail titled "Alerts" showing "No active alerts" when nothing is delayed.
  2. Desktop: one interactive Gantt row per work order (WO no. in mono link-ink, step bars clickable). Empty DB: "No work orders on the timeline."
  3. Below md the Gantt is replaced by a read-only list (WO no. + current step name + status InkChip) — no step bars.
- **Automation notes**: `getByRole("heading", { name: "Production timeline" })`; alert rail by its "Alerts" heading. Flag: Gantt step bars are styled buttons/divs without test ids — `data-testid="gantt-step-<id>"` would make bar-level clicks robust; today target by accessible name (step name) inside the row.

### TC-PROD-02 — Golden path: create a work order and open its detail
- **Target**: App @ :5173 `/production/work-orders` → `/production/work-orders/$id`
- **Persona**: super-admin (`production.wo.manage` gates create)
- **Preconditions**: at least one **routing template** exists. **Flag:** there is no UI to create one (`useCreateRoutingTemplateMutation` exists but no screen calls it) — seed it or POST `createRoutingTemplate` directly before the run. Also have a finished item id (typed directly; the drawer's hint says there is no item lookup here).
- **Priority**: golden-path
- **Steps**:
  1. Navigate to `/production/work-orders`; click "New work order".
  2. Wizard step "Details": pick a "Routing template" (placeholder "Select a routing template"), fill "Finished item id", optionally "Customer id", set "Quantity" `50`, "Due date" a near-future date, optionally "Machine". Click "Continue".
  3. Step "Review": verify the summary; click "Create work order".
  4. In the grid, open the new row's actions and click "View".
- **Expected**:
  1. Drawer "New work order" with two wizard steps "Details" / "Review"; "Continue" is disabled until template + item id + qty are set.
  2. Review lists Routing template / Finished item id / Quantity / Due date; "Back" returns to Details.
  3. Toast "Work order created"; grid columns: "WO no." (mono), "Due date", "Steps done" (`0/N` for a fresh WO), "Status" chip.
  4. Detail page tabs: "Overview", "Steps", "Defects", "History". Overview shows Finished item id / Quantity / Due date / Machine / Customer id / Mockup file key; Steps lists the template's steps with status chips; Defects shows "No defects reported"; History shows "No scan history yet."
- **Automation notes**: the list is backed by the **timeline feed** (no standalone listWorkOrders endpoint) — a WO shows up as soon as the timeline query invalidates. WO id for deep links comes from the row's View navigation.

### TC-PROD-03 — Permission gate: scan-only operator sees only the scan station
- **Target**: App @ :5173 `/production/*`
- **Persona**: `production.scan` only
- **Preconditions**: limited user created via Admin UI per the setup note (**flagged gap: manual setup, no seed**)
- **Priority**: permission-gate
- **Steps**:
  1. Sign in as the scan-only user; inspect sidebar and command palette (Ctrl/Cmd-K).
  2. Navigate to `/production` directly; then try `/production/timeline` and `/production/work-orders` by URL.
- **Expected**:
  1. Production appears in nav with **only** "Scan station" (timeline/work-orders/WIP need `production.wo.manage`; subcontracts needs `production.subcontract.manage`). Palette matches exactly.
  2. `/production` redirects to `/production/scan` (first accessible child). Timeline/work-orders URLs redirect away — absent, not disabled.
- **Automation notes**: assert final URL after redirect; palette entries via cmdk listbox after Ctrl/Cmd-K.

### TC-PROD-04 — High-risk: kiosk lockdown strips all chrome; Touch density enforced
- **Target**: App @ :5173 `/production/scan` (route carries `kiosk: true` + `kioskLockdown: true`)
- **Persona**: super-admin (or the TC-PROD-03 operator)
- **Preconditions**: logged in
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/production/scan`.
  2. Inspect the page for chrome: sidebar, top bar, breadcrumb, mobile tab bar, nav drawer trigger.
  3. Press Ctrl/Cmd-K and `/`.
  4. Check `document.documentElement.dataset.density`; try to change density (no toggle should even be reachable).
  5. Navigate back to `/production/timeline`.
- **Expected**:
  1. Heading "Scan station" and the offline-queue badge render inside a bare `<main id="shell">` — **no** sidebar, top bar, breadcrumb, tab bar, or drawer (AppChrome returns only the outlet under lockdown).
  2. The command palette does **not** open (its provider is not mounted under lockdown).
  3. `data-density="touch"` on `<html>`; there is no density toggle on-screen to override it (the toggle lives in the stripped top bar).
  4. Leaving the route restores full chrome and the user's persisted density.
- **Automation notes**: assert absence via `queryByRole("navigation")` / `queryByRole("banner")` returning null; palette non-open via absence of the cmdk dialog after keypress. Flag: with chrome stripped there is no in-app way to leave the kiosk — automation must navigate by URL (that is by design).

### TC-PROD-05 — High-risk: traveler-card scan → START / FINISH loop
- **Target**: App @ :5173 `/production/scan`
- **Persona**: super-admin or scan operator (`production.scan`)
- **Preconditions**: a work order from TC-PROD-02 with pending steps; know its **WO number** (e.g. `WO-2026-0001` — the scan resolves the code against the timeline feed's `wo_no`)
- **Priority**: high-risk
- **Steps**:
  1. On `/production/scan`, type an unknown code `XX-000` into the scan input (placeholder "Scan the traveler card") and press Enter.
  2. Type the real WO number and press Enter.
  3. On the kiosk card, tap "▶ START".
  4. Re-scan the same WO number; tap "■ FINISH".
  5. Re-scan; observe which step the card now shows. Repeat until all steps are finished, then scan once more.
- **Expected**:
  1. Danger toast `No work order found for code "XX-000"`.
  2. A KioskCard replaces the scan field: WO no., item/qty line, the current step (first IN_PROGRESS, else first PENDING) with "Elapsed"/"Not started" and standard minutes, and three large touch actions: "▶ START", "■ FINISH", "⚑ Report defect".
  3. Toast "Step started"; the card dismisses and the scan field returns focused (operator re-scans for the next action).
  4. Toast "Step finished"; the card dismisses; the step is COMPLETED (verify on the WO detail Steps tab or timeline).
  5. Each scan lands on the next unfinished step; when none remain: "This work order has no step left to scan."
- **Automation notes**: `getByPlaceholderText("Scan the traveler card")`; action buttons by exact text including glyphs ("▶ START"). Scans go through the offline queue even when online (enqueue → immediate sync) — expect a tiny async delay before server state updates.

### TC-PROD-06 — High-risk: defect capture via tile picker
- **Target**: App @ :5173 `/production/scan` and `/production/work-orders/$id`
- **Persona**: super-admin or scan operator
- **Preconditions**: WO with a current step (TC-PROD-05 mid-run)
- **Priority**: high-risk
- **Steps**:
  1. Scan the WO number; on the kiosk card tap "⚑ Report defect".
  2. Tap the "Bad stitch" tile; raise Qty to `3` with the "+" stepper ("Increase quantity").
  3. Tap "Report defect" (submit).
  4. As a supervisor, open the WO's detail page → "Defects" tab.
- **Expected**:
  1. The card is replaced by the tile picker: six large tiles — "Misprint", "Bad stitch", "Wrong size", "Stain", "Torn", "Other" — with `aria-pressed` marking the selection; a Qty stepper; submit is inert until a tile is selected.
  2. Toast "Defect reported"; the picker closes back to the scan flow.
  3. WO detail Defects tab lists the defect with type "Bad stitch" and qty 3 (no longer "No defects reported").
- **Automation notes**: tiles are buttons with `aria-pressed` — `getByRole("button", { name: "Bad stitch" })`. Note defect submission bypasses the offline queue (direct mutation) — see the flag in TC-PROD-07.

### TC-PROD-07 — High-risk: offline scan queue — queue, badge, persist, flush on reconnect
- **Target**: App @ :5173 `/production/scan`
- **Persona**: super-admin or scan operator
- **Preconditions**: WO with ≥ 2 pending steps; browser DevTools network control (Playwright: `context.setOffline(true)`)
- **Priority**: high-risk
- **Steps**:
  1. On `/production/scan`, go **offline**.
  2. Scan the WO and tap "▶ START"; re-scan (timeline is cached) and tap "■ FINISH".
  3. Observe the badge; reload the page while still offline and inspect `localStorage["erp.production.offline-scan-queue"]`.
  4. Go **online**; observe the badge and then server state (timeline/WO detail in another tab).
  5. While online, perform one more scan action and observe the badge.
- **Expected**:
  1. Actions still toast success ("Step started"/"Step finished") — enqueue is optimistic; the badge shows "Offline — 2 scan(s) queued".
  2. After reload the queue survives: localStorage holds the queued scans (`id`, `stepId`, `action`, `queuedAt`) and the badge re-shows the offline count. (Note: the scanned-card UI state itself does not survive reload — only the queue does.)
  3. On reconnect the browser `online` event triggers a drain: badge passes through "Syncing 2…" and clears; the two scans post front-to-back and the step is COMPLETED server-side.
  4. Online scans flush immediately — the badge shows "N queued" only transiently, if at all.
- **Flagged gaps**:
  1. **Idempotency not wired**: `QueuedScan.id` is designed as a stable idempotency key ("a submit that forwards it never double-posts"), but the scan page's `submit` calls `scanWoStep` **without forwarding it** — a replay after a request that succeeded server-side but failed on the wire can double-post a scan. Flag for a fix (send the id as the idempotency header the API's idempotency interceptor consumes).
  2. Defect reports (TC-PROD-06) and hold/subcontract do **not** go through the queue — offline they fail outright; only START/FINISH scans are offline-safe. Confirm that's the intended scope.
- **Automation notes**: Playwright `context.setOffline`; badge text by regex `/Offline — \d+ scan/`. jsdom-free real-browser case — do not attempt in Vitest.

### TC-PROD-08 — Step drawer: hold and subcontract-send from the timeline
- **Target**: App @ :5173 `/production/timeline`
- **Persona**: super-admin (`production.wo.manage` for timeline access; subcontract actions live here too)
- **Preconditions**: WO with an in-progress or pending step
- **Priority**: high-risk
- **Steps**:
  1. Click a step bar on a Gantt row.
  2. In the drawer, review the fields; click "Hold" and confirm the dialog.
  3. Reopen the step; click "Subcontract"; fill "Vendor" (e.g. `Siam Stitch Co.`) and "SLA due" (date-time), click "Send".
- **Expected**:
  1. A drawer opens for the step: WO no. in the title area, "Assigned"/"Unassigned", "Machine" (or "—"), "Elapsed" vs "Standard" minutes ("Not started" if untouched), "Defects" section ("No defects reported" here — the timeline feed carries no defect log; the WO detail is the authoritative defect view).
  2. Hold confirm: title "Put this step on hold?", consequence "The step stops the clock until it's resumed." → toast "Step put on hold"; the step's chip flips to the hold state on the row.
  3. Subcontract panel: "Send this step to a subcontractor" with Vendor + "SLA due"; after Send → toast "Step sent to subcontractor"; the subcontract appears on `/production/subcontracts` (TC-PROD-10).
- **Automation notes**: drawer via `getByRole("dialog")`; "Reassign" input ("Assigned to (employee id)") exists in the drawer as well — smoke-tap it if time permits. If a step runs past its standard minutes, the alert rail lists `"<step> is running over its <N>m standard"` and clicking the alert opens this same drawer — cover opportunistically.

### TC-PROD-09 — Realtime: a scan in one session pulses the timeline in another
- **Target**: App @ :5173 `/production/timeline` + `/production/scan` (two browser contexts)
- **Persona**: super-admin (both sessions)
- **Preconditions**: WO with a pending step; Socket.IO reachable (`/socket.io` proxied)
- **Priority**: high-risk
- **Steps**:
  1. Session A: open `/production/timeline` and keep it visible.
  2. Session B: on `/production/scan`, scan the WO and tap "▶ START".
  3. Watch session A without reloading.
- **Expected**:
  1. Within a couple of seconds session A's row updates: the scanned step's chip flips to in-progress **without a page reload**, and the step briefly pulses (`pulsingStepIds` animation).
- **Automation notes**: two Playwright contexts; assert the chip status change (text/status) rather than the transient pulse class — flag: the pulse has no stable hook, a `data-pulsing="true"` attribute would make the animation assertable.

### TC-PROD-10 — Subcontracts: SLA chip states and receive
- **Target**: App @ :5173 `/production/subcontracts`
- **Persona**: super-admin (`production.subcontract.manage` gates Receive)
- **Preconditions**: one subcontract sent with a future SLA (TC-PROD-08) and, ideally, one sent with a past SLA (send with an SLA due in the past to fabricate "Overdue")
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/production/subcontracts`; exercise the Status filter (All / Sent / Overdue / Received).
  2. Read the SLA column for each row.
  3. Click "Receive" on a sent row.
- **Expected**:
  1. Table columns: "WO no." / "Step" / "Vendor" / "SLA"; the filter narrows rows by status; empty filter result shows "No subcontracts yet."
  2. SLA chip renders per state: future → `Due in <duration>`; past → `Overdue by <duration>`; received → "Received"; missing SLA → "No SLA set".
  3. Toast "Subcontract received"; the row's chip flips to "Received" and its Receive button disappears; the step returns to the line (WO detail/timeline reflect it).
  4. For a limited persona without `production.subcontract.manage` that can still reach this screen (not possible via nav alone — flag: the route requires the same permission, so the disabled-button state of "Receive" is only observable for a persona holding it; the gate is effectively at route level here).
- **Automation notes**: chip text via regex `/^(Due in|Overdue by|Received|No SLA set)/`.

### TC-PROD-11 — WIP board renders per-department load
- **Target**: App @ :5173 `/production/wip`
- **Persona**: super-admin
- **Preconditions**: at least one step IN_PROGRESS (TC-PROD-05 mid-run); a delayed step for the danger badge if achievable
- **Priority**: smoke
- **Steps**:
  1. Navigate to `/production/wip`.
- **Expected**:
  1. Heading "WIP / bottleneck board"; one card per department labelled `Department <id>` (**flag/known gap:** raw department id, no name join in the contract).
  2. Each card shows an info badge `<N> in progress` and, only when delayed steps exist, a danger badge `<N> delayed`; cards sort most-delayed first. Empty: "No in-progress steps right now."
- **Automation notes**: badges by text regex; card order by DOM order of the department labels.
