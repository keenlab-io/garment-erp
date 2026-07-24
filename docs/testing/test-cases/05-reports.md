# 05 — Reports & Analytics (`/reports`, `/`) test cases

UI test cases for the M6 reporting module: the reports catalog home, the five domain dashboards,
the 16-key report viewer with async exports, digest schedules, and the landing `/` Overview
dashboard's cross-filter. High-risk focus: per-permission dashboard/KPI masking, the export job
lifecycle (`POST export → poll /exports/:job_id`), and schedule cron + run-now.

**Coverage checklist**

- [x] Smoke: `/reports` catalog home (TC-RPT-01)
- [x] Golden path: home → dashboard → View report → drill-down (TC-RPT-02)
- [x] Permission gate: group-filtered catalog + absent dashboards (TC-RPT-03)
- [x] High-risk: cost/profit KPI masking with route still enterable (TC-RPT-04)
- [x] Landing `/` Overview cross-filter (dimension/value drill) (TC-RPT-05)
- [x] Viewer: slice carry-over + From/To clears the slice (TC-RPT-06)
- [x] High-risk: export job lifecycle PDF/EXCEL/CSV (TC-RPT-07)
- [x] High-risk: schedule create (cron cadence) (TC-RPT-08), run-now poll (TC-RPT-09), edit/delete (TC-RPT-10)
- [x] Permission gate: schedules need `report.schedule.manage` (TC-RPT-11)

> **Persona setup:** `VITE_DEV_PERMISSIONS` does **not** apply to the running app (unit tests only).
> Limited personas (e.g. "Reports viewer") must be real users: as `superadmin` create a role in
> `/admin/roles` with the case's permission CSV, create a user in `/admin/users`, sign in as them.
> **Flagged test-data gap:** no seeded reports personas; dashboards/reports need seeded business
> data (sales documents, stock movements) to show non-zero values — provision via the sales/
> inventory golden paths or a seed extension first.

---

### TC-RPT-01 — Smoke: reports catalog home renders all groups for super-admin
- **Target**: App @ :5173 `/reports`
- **Persona**: super-admin
- **Preconditions**: logged in as `superadmin`
- **Priority**: smoke
- **Steps**:
  1. Click "Reports" in the sidebar.
  2. Inspect the two sections and the footer link.
- **Expected**:
  1. Heading "Reports". Section "Dashboards" lists 5 links: Inventory dashboard, Sales dashboard, Cost dashboard, Profit dashboard, Tax dashboard.
  2. Section "Reports catalog" lists all 5 groups with their 16 report links, e.g. Inventory: "Stock balance", "Stock movement", "Low stock", "Dead stock"; Sales: "Sales overview", "Top products", "Sales by customer", "Document status"; Cost: "Monthly COGS", "Cost variance", "Stock valuation"; Profit: "Margin by item", "Profit by order", "Net profit estimate"; Tax: "PP.30 output tax", "AR aging".
  3. Link "Report schedules" is present (super-admin holds `report.schedule.manage`).
- **Automation notes**: all entries are `role="link"` by visible name; catalog link URLs use dotted keys (`/reports/sales.overview`). No test ids — ARIA only.

### TC-RPT-02 — Golden path: dashboard → View report → viewer → drill-down
- **Target**: App @ :5173 `/reports/dashboards/sales` → `/reports/$reportKey`
- **Persona**: super-admin
- **Preconditions**: at least one issued sales invoice exists (sales golden path) so panels have rows
- **Priority**: golden-path
- **Steps**:
  1. From `/reports`, click "Sales dashboard".
  2. Verify the panel grid; on the "Sales overview" panel note the headline KPI card and the "Trend" chart.
  3. Click that panel's "View report" link.
  4. In the viewer, verify the totals strip and the data table; open a row's action menu → "View detail" (rows carrying `customer_id`).
- **Expected**:
  1. Heading "Sales dashboard"; one card per catalog panel, each with a KPI stat card (money format) and, for charting panels, a "Trend" chart.
  2. Viewer URL `/reports/sales.overview` (search may carry `dimension`/`value`); heading "Sales overview"; "From"/"To" date fields; table with the report's own columns; totals row(s) "Total {column}: {value}"; toolbar export group.
  3. "View detail" navigates to `/sales/customers/{id}` (or `/inventory/items/{id}` for item reports); reports with neither id column show no row action.
- **Automation notes**: backing endpoints `GET /dashboards/:group`, `GET /reports/:report_key`. Chart is Recharts SVG — prefer asserting the KPI/table over chart internals. Flag: chart data points lack test hooks (see TC-RPT-05).

### TC-RPT-03 — Permission gate: catalog and dashboards filter to held groups
- **Target**: App @ :5173 `/reports`
- **Persona**: report.sales.view
- **Preconditions**: real user with a role granting only `report.sales.view` (see persona setup); signed in as them
- **Priority**: permission-gate
- **Steps**:
  1. Open `/reports`.
  2. Inspect Dashboards and Reports catalog sections.
  3. Open the command palette (Cmd/Ctrl-K) and search "cost".
- **Expected**:
  1. Dashboards section shows only "Sales dashboard" — the other four links are **absent** from the DOM (not disabled).
  2. Reports catalog shows only the Sales group (4 links); Inventory/Cost/Profit/Tax groups absent. "Report schedules" link absent (no `report.schedule.manage`).
  3. Palette has no cost/profit dashboard entries — nav/palette/route parity.
- **Automation notes**: assert `queryByText("Cost dashboard")` etc. resolve to nothing. Flag persona provisioning (no seed). Note: cost/profit groups additionally require `inventory.cost.view` even when `report.cost.view` is held — cover that split in TC-RPT-04.

### TC-RPT-04 — High-risk: cost/profit KPI masking when route is enterable
- **Target**: App @ :5173 `/reports/dashboards/cost` (and `/reports/dashboards/profit`)
- **Persona**: report.cost.view,report.profit.view (no `inventory.cost.view`)
- **Preconditions**: real user with exactly that role; signed in as them
- **Priority**: high-risk
- **Steps**:
  1. Navigate directly to `/reports/dashboards/cost` (the route is enterable — the user holds the group permission).
  2. Inspect what renders and watch the network panel.
  3. Repeat for `/reports/dashboards/profit`.
  4. Sign in as `superadmin` and load the same routes.
- **Expected**:
  1. Heading "Cost dashboard" renders, but **no panel grid**: a single KPI stat card stands in, masked with lock + `••••` and sr-only "Restricted — requires cost access".
  2. **No** `GET /dashboards/cost` request fires (the query is disabled without `inventory.cost.view` — the backend would 403 wholesale); no cost figure exists anywhere in the DOM.
  3. Profit dashboard behaves identically.
  4. Super-admin sees the full panel grid with real money KPIs and Trend charts.
- **Automation notes**: combine DOM assertion (`text=••••`, sr-only restricted label) with request interception asserting zero dashboard calls. Flag: the masked stand-in card has no test id — the restricted sr-only text is the stable hook.

### TC-RPT-05 — High-risk: landing `/` Overview cross-filter (dimension/value drill)
- **Target**: App @ :5173 `/`
- **Persona**: super-admin
- **Preconditions**: sales data across ≥2 days exists so the "Sales trend" chart has multiple points
- **Priority**: high-risk
- **Steps**:
  1. Load `/`. Verify heading "Overview", the KPI card row (one card per held report group: Inventory/Sales/Cost/Profit/Tax dashboards), the "Sales trend" chart, and the "Alerts" panel.
  2. Click a data point/bar in the "Sales trend" chart.
  3. Inspect the URL and the chip rail.
  4. Click the chip's remove button, or "Clear".
- **Expected**:
  1. Cost/Profit KPI cards render masked (lock) for viewers without `inventory.cost.view`; each card has its own loading skeleton — no single group blocks the rest. With no report permissions at all the row is replaced by "No report access yet — ask an admin to grant a reporting permission."
  2. Clicking a point sets typed search params `?dimension=day&value=YYYY-MM-DD`; the "Active filters" chip rail appears with a chip labeled "Day: {value}" and a "Clear" button; KPI panels refetch with the slice applied; the selected chart element is highlighted (activeValue).
  3. Remove (accessible name "Remove filter: Day: {value}") or "Clear" empties the search params and the rail disappears; panels refetch unfiltered.
  4. Alerts panel lists stock/production/finance alerts each with a "View" action, or "No alerts — everything's on track."
- **Automation notes**: chart interaction targets Recharts SVG nodes — **flag (gap):** no stable hook on chart points; Playwright must click by SVG geometry or dispatch on `.recharts-*` classes. Prefer asserting the URL search-param change as ground truth. Chip rail group has accessible name "Active filters".

### TC-RPT-06 — Viewer: inherited slice + From/To edit clears it
- **Target**: App @ :5173 `/reports/sales.overview`
- **Persona**: super-admin
- **Preconditions**: sales data exists
- **Priority**: golden-path
- **Steps**:
  1. From a dashboard panel with an active cross-filter (TC-RPT-05 state), click "View report" — the link carries `dimension`/`value`.
  2. Verify the viewer's chip rail shows the same slice chip.
  3. Type a date into "From".
- **Expected**:
  1. Viewer opens with the "Active filters" chip (e.g. "Day: 2026-07-01") and rows restricted to the slice.
  2. Editing From (or To) **clears** `dimension`/`value` from the URL and the chip rail — the backend window resolver prefers `dimension` when both are present, so the UI drops it (screen docstring).
  3. Table refetches with the new date window; empty result shows "No rows for this selection."
- **Automation notes**: assert search-param transitions; `GET /reports/sales.overview?from=…` visible in network. Date inputs are native `type="date"` inside FormFields "From"/"To".

### TC-RPT-07 — High-risk: export job lifecycle — enqueue, poll, download / fail
- **Target**: App @ :5173 `/reports/$reportKey` (report-data-table export menu)
- **Persona**: super-admin
- **Preconditions**: any report with rows (e.g. `stock.balance` or `sales.overview`); Redis + MinIO up (export worker + storage)
- **Priority**: high-risk
- **Steps**:
  1. In the viewer toolbar find the export group (accessible name "Export") with three buttons: "PDF", "EXCEL", "CSV".
  2. Click "PDF". Observe the job toast.
  3. Wait for the poll cycle to finish; click the toast's "Download" action.
  4. Repeat with "CSV".
  5. Failure path: intercept `GET /exports/:job_id` to return status FAILED (or kill the worker) and click "EXCEL".
- **Expected**:
  1. Toast "Generating PDF export…" appears immediately; `POST /reports/{report_key}/export` returns 202 `{ job_id }`; the UI polls `GET /exports/{job_id}` while status is PENDING/RUNNING.
  2. On DONE the toast resolves to success "Export ready" with a "Download" action; clicking opens the signed `file_url` in a new tab.
  3. CSV behaves identically ("Generating CSV export…").
  4. On FAILED (or a non-202 enqueue, or network error) the toast resolves to danger "Export failed"; no Download action.
- **Automation notes**: intercept the poll endpoint to script DONE/FAILED deterministically; toast actions are buttons inside the toast region. Flag: the export buttons' visible text is the raw enum value ("PDF"/"EXCEL"/"CSV") — stable, but the toast is the only completion signal (no export-history UI).

### TC-RPT-08 — High-risk: create a schedule — cadence → cron → save
- **Target**: App @ :5173 `/reports/schedules` (schedule-editor)
- **Persona**: super-admin (holds `report.schedule.manage`)
- **Preconditions**: none (empty list shows "No schedules yet.")
- **Priority**: high-risk
- **Steps**:
  1. Open `/reports/schedules`. Verify heading "Report schedules" and the "New schedule" editor above the "Schedules" list.
  2. Fill "Schedule name" = `Daily stock digest`; "Report" = "Stock balance"; "Frequency" = "Every day"; "Time" = `08:00`.
  3. In "Recipients" type `owner@example.com` (placeholder `name@example.com`) and click "Add"; add a second recipient and remove it via its remove button ("Remove {email}").
  4. Verify the live preview line; leave "Format" = PDF and Active on; click "Save schedule".
  5. Switch "Frequency" to "Weekly" briefly to verify the "Day of week" select appears (Sunday…Saturday), then cancel/reset.
- **Expected**:
  1. Preview reads "Sends Every day 08:00" and updates live with cadence changes.
  2. Toast "Schedule saved"; the form resets; the list shows the row: name, badge "Active" (success tone), summary "Stock balance · Every day 08:00 · PDF", recipients line, and buttons "Edit", "Run now", "Delete".
  3. The persisted cron round-trips: reloading the page shows the same cadence text (cron ↔ cadence codec `cron.ts`).
- **Expected** (negative): saving with no name/recipients is blocked by field validation; a failed save shows toast "Couldn't save the schedule".
- **Automation notes**: `POST /report-schedules` (create) / `PUT` with `if-match` version (update). Flag: list rows are `li` elements without test ids and each row repeats the same button names — scope by row text (`getByRole("listitem").filter({ hasText: "Daily stock digest" })`).

### TC-RPT-09 — High-risk: schedule run-now — job poll to Digest sent / failed + Retry
- **Target**: App @ :5173 `/reports/schedules`
- **Persona**: super-admin
- **Preconditions**: a saved schedule (TC-RPT-08); queue worker up
- **Priority**: high-risk
- **Steps**:
  1. Click "Run now" on the schedule's row.
  2. Observe the toast lifecycle.
  3. Failure path: intercept the run-now POST (non-202) or the `GET /exports/:job_id` poll (status FAILED); click "Run now" again.
  4. Click the failure toast's "Retry" action.
- **Expected**:
  1. Toast 'Sending "Daily stock digest" now…'; `POST /report-schedules/:id/run` returns 202 `{ job_id }`; UI polls `GET /exports/{job_id}` (generic job endpoint); button shows loading while polling.
  2. On DONE toast resolves to success "Digest sent".
  3. On FAILED toast resolves to danger "Digest send failed" **with a "Retry" action**; Retry re-triggers the whole run-now flow.
- **Automation notes**: same poll-interception pattern as TC-RPT-07. Flag: there is no persisted last-run status on the schedule row (by design) — the toast is the only observable outcome.

### TC-RPT-10 — Schedules: edit in place and delete with confirmation
- **Target**: App @ :5173 `/reports/schedules`
- **Persona**: super-admin
- **Preconditions**: a saved schedule (TC-RPT-08)
- **Priority**: golden-path
- **Steps**:
  1. Click "Edit" on the row. Verify the editor heading flips to "Edit schedule" and fields prefill (name, report, cadence, recipients, format, Active).
  2. Change Frequency to "Weekly", "Day of week" = "Monday", Time = `07:30`; click "Save schedule".
  3. Click "Cancel edit" behavior check: re-enter edit, then click "Cancel edit".
  4. Click "Delete"; in the dialog "Delete schedule" read the consequence and confirm.
- **Expected**:
  1. Save toast "Schedule saved"; row summary updates to "… · Every Monday 07:30 · …"; editor resets to "New schedule".
  2. "Cancel edit" resets the form without saving.
  3. Delete dialog consequence: 'This deletes the "Daily stock digest" schedule and stops its digest emails.'; destructive styling; on confirm toast "Schedule deleted" and the row disappears ("No schedules yet." when last).
- **Automation notes**: update sends `if-match` with the row version — editing a stale row (changed in another tab) should 409; worth one concurrency probe. Delete endpoint `DELETE /report-schedules/:id`.

### TC-RPT-11 — Permission gate: schedules require `report.schedule.manage`
- **Target**: App @ :5173 `/reports/schedules`
- **Persona**: report.sales.view (no `report.schedule.manage`)
- **Preconditions**: real user with that role (see persona setup); signed in as them
- **Priority**: permission-gate
- **Steps**:
  1. Open `/reports` — look for the "Report schedules" link.
  2. Navigate directly to `/reports/schedules`.
  3. Open the command palette and search "schedule".
- **Expected**:
  1. The link is absent from the home page.
  2. The route guard redirects away (module/child-route permission gating — the screen never renders); no `GET /report-schedules` request fires.
  3. No palette entry for schedules.
- **Automation notes**: assert final URL after direct navigation (redirect target is the first accessible child / login notice per guards). Flag persona provisioning gap.

---

**Flagged gaps (Reports)**

1. No seeded reports personas and no seeded business data — dashboards/KPIs render zeros on a fresh DB; sales/inventory fixtures must exist for meaningful assertions.
2. Recharts chart points (cross-filter drill, TC-RPT-05) have no stable selectors — clicking by SVG geometry is brittle; a `data-testid` per chart series/point would fix this.
3. Export/run-now completion is toast-only (no export-history or last-run-status surface) — deterministic CI runs must intercept `GET /exports/:job_id`.
4. Zero `data-testid`s across reporting screens; schedule list rows and repeated per-row button names ("Edit"/"Run now"/"Delete") require text-scoped row filtering.
