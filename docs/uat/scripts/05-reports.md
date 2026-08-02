# 05 — Reports & Analytics UAT script

Business acceptance scenarios for the Reports module: the reports catalog, domain
dashboards, drilling from a dashboard into the full report viewer, cross-filtering by date,
confidentiality of cost/profit figures, exporting to PDF/Excel/CSV, drill-down to the
underlying customer or item, and recurring email digests.

Audience: Owner/GM, Accountant, and any manager granted reporting access. For environment
bring-up see `docs/testing/UI_TEST_PLAN.md` §Quickstart; engineer-level detail for the same
screens lives in `docs/testing/test-cases/05-reports.md`. Roles and their permission bundles
are defined once in `docs/uat/UAT_PLAN.md`.

**Coverage checklist**

- [ ] Orientation: reports catalog home shows dashboards and the report list (UAT-RPT-01)
- [ ] Golden workflow: dashboard → open report → drill down to the customer/item (UAT-RPT-02)
- [ ] Role acceptance: sales-only viewer sees sales, never cost/profit (UAT-RPT-03)
- [ ] Cost/profit KPI masking for viewers without cost visibility (UAT-RPT-04)
- [ ] Date/dimension cross-filter: one click re-filters the sibling panels (UAT-RPT-05)
- [ ] Report export PDF / Excel / CSV — background job to a downloadable file (UAT-RPT-06)
- [ ] Schedule a recurring digest (Monday 08:00) and send it now (UAT-RPT-07)
- [ ] Edit and delete a schedule (UAT-RPT-08)
- [ ] Role acceptance: schedule management is restricted (UAT-RPT-09)

> **Bootstrap caveat — read first.** The system ships with only the Super Admin account.
> The limited viewers used in UAT-RPT-03/04/09 must first be provisioned by the Super Admin —
> that procedure is **UAT-ADMIN-02** in `docs/uat/scripts/06-admin.md`. Reports also show
> zeros on an empty system: run the Sales golden path (`docs/uat/scripts/03-sales.md`) and/or
> journey J1 first so dashboards have real figures, ideally with sales on at least two
> different days.

---

### UAT-RPT-01 — Orientation: the reports catalog shows everything the viewer may see
- **Business role**: Owner/GM (run as Super Admin for the full view)
- **Business goal**: Confirm the reports home is a complete, navigable catalog.
- **Preconditions / test data**: Signed in as Super Admin.
- **Steps**:
  1. Open **Reports** from the main navigation.
  2. Review the two sections: dashboards and the reports catalog.
- **Expected result**:
  1. Five dashboards are offered: Inventory, Sales, Cost, Profit, Tax.
  2. The catalog lists the reports under their five groups — e.g. Inventory (Stock balance, Stock movement, Low stock, Dead stock), Sales (Sales overview, Top products, Sales by customer, Document status), Cost (Monthly COGS, Cost variance, Stock valuation), Profit (Margin by item, Profit by order, Net profit estimate), Tax (PP.30 output tax, AR aging).
  3. A link to **Report schedules** appears for users allowed to manage digests.
- **Acceptance criterion**: Every dashboard and report the viewer is entitled to is reachable from one home page.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M6): "browse catalog / drill from a dashboard panel → open report → filter by date/dimension".
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-RPT-02 — Golden workflow: dashboard → full report → drill down to the record behind the number
- **Business role**: Owner/GM (run as Super Admin)
- **Business goal**: Start from a headline number, open the report behind it, and land on the actual customer (or item) driving it.
- **Preconditions / test data**: At least one issued sales invoice exists (Sales script / journey J1).
- **Steps**:
  1. From the reports home, open the **Sales dashboard**.
  2. On the **Sales overview** panel, read the headline figure and its trend chart, then choose **View report**.
  3. In the report viewer, review the date range fields, the data table, and the totals line.
  4. On a row tied to a customer, choose to view its detail.
- **Expected result**:
  1. The dashboard shows one panel per sales report, each with a money-formatted headline figure.
  2. The viewer opens on the same report with its own columns, a totals line, from/to date filters, and export options.
  3. Viewing a row's detail lands on that customer's record in the Sales module (item-based reports land on the item's record in Inventory); the numbers there are consistent with the report row.
- **Acceptance criterion**: A headline KPI can be traced, in three clicks, to the underlying business record.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M6): "data table with totals → … → drill-down rows navigate to item/customer."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-RPT-03 — Role acceptance: a sales-only viewer sees sales and nothing else
- **Business role**: Sales staff (sales-reporting-only viewer per the UAT_PLAN roles table; provision via UAT-ADMIN-02)
- **Business goal**: Prove a viewer entitled only to sales reporting can work with sales figures but can never reach cost or profit figures.
- **Preconditions / test data**: The restricted viewer provisioned; sales data exists.
- **Steps**:
  1. Sign in as the sales-only viewer and open **Reports**.
  2. Review which dashboards and catalog groups are offered.
  3. Search the app-wide command search for "cost" and "profit".
  4. Open the Sales dashboard and one sales report to confirm they work normally.
- **Expected result**:
  1. Only the **Sales dashboard** and the **Sales group** of reports are offered — Inventory, Cost, Profit, and Tax entries are simply absent (not greyed out).
  2. The command search offers no cost or profit destinations.
  3. Sales dashboards and reports open and show real figures for this viewer.
  4. There is no route by which this viewer can display a cost or profit figure.
- **Acceptance criterion**: The sales-only viewer has full use of sales reporting and zero visibility of cost/profit reporting.
- **Traces to**: BACKEND_SPEC M6 §6.7: "A user with report.sales.view but not inventory.cost.view opens sales reports but gets 403 on cost/profit reports." (In the UI this is experienced as cost/profit entries being absent/refused, not an error code.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-RPT-04 — Cost & profit KPIs stay masked without cost visibility
- **Business role**: A manager granted the cost/profit report groups but deliberately **not** cost visibility (restricted persona per UAT_PLAN; provision via UAT-ADMIN-02)
- **Business goal**: Prove that even a user who can open the cost/profit dashboards cannot read a cost or profit figure without the separate cost-visibility entitlement.
- **Preconditions / test data**: The restricted manager provisioned; business data exists so a real figure would otherwise show.
- **Steps**:
  1. Sign in as the restricted manager and open the **Cost dashboard**.
  2. Inspect what renders where the KPIs would be.
  3. Repeat for the **Profit dashboard**, and check the cost/profit cards on the landing overview page.
  4. Sign in as the Super Admin and load the same pages.
- **Expected result**:
  1. The dashboard page itself opens (the manager holds the group), but the figures are **masked** — a lock-and-dots placeholder stands in; no chart or table of cost data loads behind it.
  2. No cost or profit amount is readable anywhere on the page.
  3. The overview page's cost/profit cards show the same mask while other cards load normally.
  4. The Super Admin sees the full panels with real money figures.
- **Acceptance criterion**: Without cost visibility, cost/profit numbers are masked everywhere they would appear — never partially revealed.
- **Traces to**: BACKEND_SPEC M6 §6.7: "A user with report.sales.view but not inventory.cost.view opens sales reports but gets 403 on cost/profit reports." — plus the verified UI behaviour (UAT context brief §4, M6): "COST and PROFIT … KPIs are **masked** (not blocked) without it."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-RPT-05 — Cross-filter: one click on a period re-filters the sibling panels
- **Business role**: Owner/GM (run as Super Admin)
- **Business goal**: Slice the whole sales picture to one period with a single click and get it back just as easily.
- **Preconditions / test data**: Sales spread across at least two days (so filtering visibly changes the numbers).
- **Steps**:
  1. Open the landing **Overview** (or the Sales dashboard) and note the current figures on the sales trend, top products, and sales-by-customer panels.
  2. Click the current period (e.g. this month / a specific day) on the sales trend chart.
  3. Read the active-filter chip that appears and compare the sibling panels' figures.
  4. Follow **View report** into the full report and confirm the same slice is applied there.
  5. Remove the filter chip (or choose Clear).
- **Expected result**:
  1. One click applies the period to **every** sibling panel — top products and sales-by-customer re-filter to the same window; a chip names the active period.
  2. The full report opens already sliced to that period, showing the same chip.
  3. Changing the report's from/to dates replaces the slice with the typed window.
  4. Clearing the chip restores all panels to their unfiltered figures.
- **Acceptance criterion**: One selection filters all related panels to the same window, and clearing it restores them.
- **Traces to**: BACKEND_SPEC M6 §6.7: "Clicking 'this month' on the sales panel re-filters Top-Products and Sales-by-Customer to the same window (single dimension across panels)."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-RPT-06 — Export a report to PDF, Excel, and CSV as a background job
- **Business role**: Accountant (run as Super Admin)
- **Business goal**: Take a report out of the system in the three office formats.
- **Preconditions / test data**: Any report with rows (e.g. Sales overview or Stock balance). Background job and file-storage services running (see `docs/testing/UI_TEST_PLAN.md` §Quickstart).
- **Steps**:
  1. In the report viewer, start a **PDF** export.
  2. Watch the progress notification through to completion, then use its **Download** action.
  3. Repeat for **CSV** and **Excel**.
- **Expected result**:
  1. Each export immediately confirms it is being generated, works in the background (the report stays usable meanwhile), and finishes with an **Export ready** notification carrying a Download action.
  2. Download opens/saves the produced file; its contents match the on-screen report (spot-check a total).
  3. If a job fails, the notification says so plainly and offers no download — no silent hang.
- **Acceptance criterion**: All three formats produce a ready-to-download file announced by the completion notification.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M6): "**export** PDF/EXCEL/CSV as async job (`ExportStatus` PENDING → RUNNING → DONE (signed URL) | FAILED)."
- **Note**: Completion is announced by the notification only — there is no export-history page to revisit a finished file. If the notification is dismissed, re-run the export.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-RPT-07 — Schedule a Monday-morning digest and send it now
- **Business role**: Owner/GM (schedule manager; run as Super Admin)
- **Business goal**: Set up a recurring emailed report so stakeholders get figures without logging in — and trigger one send immediately to prove it works.
- **Preconditions / test data**: A report with data (e.g. Stock balance). Background job services running. Access to the recipient inbox for out-of-band verification.
- **Steps**:
  1. Open **Report schedules** and create a schedule: name "Weekly stock digest", report Stock balance, frequency **Weekly**, day **Monday**, time **08:00**, one recipient email, format PDF, active.
  2. Check the live summary line before saving, then save.
  3. On the saved row, choose **Run now** and watch the notification through to completion.
  4. Reload the page and re-read the row.
- **Expected result**:
  1. The summary reads back the plain-language cadence — every **Monday 08:00** — before and after saving; saving with no name or no recipient is refused.
  2. The saved row shows the name, an **Active** badge, the report, cadence, format, and recipients.
  3. Run-now confirms the digest is being sent and then that it **was sent**; if a send fails, the failure is announced with a **Retry** action.
  4. After reload the schedule still shows the same cadence (nothing was lost or reinterpreted).
- **Acceptance criterion**: The Monday 08:00 schedule is stored and read back correctly, and an on-demand send completes (or fails loudly with a retry).
- **Traces to**: BACKEND_SPEC M6 §6.7: "A `0 8 * * 1` schedule emails recipients a summary+attachment every Monday 08:00; a send failure retries and surfaces an in-app alert."
- **Note**: The actual Monday-morning delivery and the email's attachment are verified in the recipient's inbox, outside the UAT session window — record the inbox check as evidence when it lands.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-RPT-08 — Edit a schedule in place, then delete it with confirmation
- **Business role**: Owner/GM (schedule manager; run as Super Admin)
- **Business goal**: Keep the digest list tidy — change a cadence without recreating it, and remove a schedule deliberately, not by accident.
- **Preconditions / test data**: The saved schedule from UAT-RPT-07.
- **Steps**:
  1. Choose **Edit** on the schedule; confirm the form prefills with its current settings.
  2. Change the time to **07:30**, save, and re-read the row.
  3. Re-enter edit and cancel without saving; confirm nothing changed.
  4. Choose **Delete**; read the confirmation dialog, then confirm.
- **Expected result**:
  1. The row's summary updates to the new time after saving.
  2. Cancelling an edit leaves the schedule untouched.
  3. The delete dialog is visibly destructive and states that the schedule's digest emails will stop; after confirming, the row disappears (an empty list says so honestly).
- **Acceptance criterion**: Edits round-trip correctly and deletion requires an explicit, informed confirmation.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M6): "Schedules manage recurring email digests."
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence

### UAT-RPT-09 — Role acceptance: only schedule managers can manage schedules
- **Business role**: Sales staff (sales-reporting-only viewer from UAT-RPT-03)
- **Business goal**: Prove ordinary report viewers cannot create or change the company's digest schedules.
- **Preconditions / test data**: The restricted viewer provisioned (UAT-ADMIN-02); a schedule exists (UAT-RPT-07).
- **Steps**:
  1. Sign in as the restricted viewer and open **Reports**.
  2. Look for any schedules entry on the page and in the command search.
  3. Attempt to reach the schedules page directly (e.g. via a bookmarked link from the Super Admin session).
- **Expected result**:
  1. No schedules link is offered anywhere.
  2. The direct attempt never shows the schedules page — the viewer is redirected to a page they are entitled to.
  3. The existing schedule is unaffected.
- **Acceptance criterion**: A viewer without schedule-management rights can neither see nor reach the schedules screen.
- **Traces to**: UX Acceptance — verified module map (UAT context brief §4, M6): "`/reports/schedules` (`report.schedule.manage`)" gating.
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence
