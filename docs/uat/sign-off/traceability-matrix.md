# UAT Traceability Matrix

Every backend acceptance criterion in `docs/BACKEND_SPEC_M1-M6.md` (§1.8, §2.8, §3.8, §4.7, §5.8,
§6.7), mapped to the UAT scenario(s) that exercise it. This is the evidence that "passing UAT" covers
the specified capabilities — and, just as importantly, an honest record of what UAT **cannot** prove
through the UI.

**Coverage legend**
- **UI** — fully acceptance-testable through the UI by a business user; the mapped scenario is the proof.
- **UI-proxy** — the business-visible outcome is testable, but part of the criterion (an HTTP status
  code, an audit-row's internal shape, exact costing math) is verified indirectly. The scenario asserts
  the observable proxy; the exact internal is delegated to the engineer integration layer.
- **Backend** — not observable through the UI at all (concurrency, ledger-replay equality, signed-URL
  expiry, materialized-view equality, email delivery). Covered by the API/integration test suite, not
  UAT. Listed here so nothing is silently dropped.

> Reading note: several criteria are split across scenarios (e.g. "receive 20kg **and** issue 5kg" is
> proven by a receive scenario plus an issue scenario). The **Scenario(s)** column lists every UAT id
> that contributes.

---

## M1 — Admin & Access (§1.8)

| # | Acceptance criterion (abbreviated) | Scenario(s) | Coverage |
|---|---|---|---|
| 1.8-a | Changing an online user's roles ⇒ next request 401 until re-login | UAT-ADMIN-07 | UI |
| 1.8-b | Role delete without valid super-admin password ⇒ 403, no change, no audit row | UAT-ADMIN-08 | UI-proxy (refusal visible; the 403/no-row internals are integration) |
| 1.8-c | Deleting a role still bound to ≥1 user ⇒ 409 | UAT-ADMIN-08 | UI-proxy (refusal + reassign-first message) |
| 1.8-d | Every authz mutation writes an audit_log row (PERMISSION_CHANGE, before/after, actor, ts) | UAT-ADMIN-09 | UI |
| 1.8-e | 6 bad logins ⇒ account locked 15 min; correct password during lock still refused | UAT-ADMIN-11 | UI |

## M2 — HR & Payroll (§2.8)

| # | Acceptance criterion (abbreviated) | Scenario(s) | Coverage |
|---|---|---|---|
| 2.8-a | OT 3h requested, 2h attended ⇒ reconcile sets approved 2h, pay reflects 2h | UAT-J2-03, UAT-HR-05 (reconcile); UAT-J2-04, UAT-HR-10 (pay reflects) | UI |
| 2.8-b | APPROVED payroll auto-inserts outstanding advance into deductions; net exact to the cent; advance decremented | UAT-HR-08, UAT-J2-04 (net exact) | UI-proxy — net-exact & wizard are UI; the **advance auto-deduction half is Not-UAT-testable** because cash-advance **disburse has no UI** (see §Gaps) |
| 2.8-c | User lacking `hr.salary.view` gets monetary fields omitted | UAT-HR-03, UAT-HR-10 | UI |
| 2.8-d | Approving a payroll run twice ⇒ second call 409 | UAT-HR-09, UAT-J2-05 | UI-proxy (already-approved refusal; 409 code is backend) |
| 2.8-e | Payslip PDF link is a signed URL that expires; opening requires the configured password | UAT-HR-10 (in-app breakdown only) | Backend — signed-URL expiry + PDF password are not UI-observable |

## M3 — Inventory & Costing (§3.8)

| # | Acceptance criterion (abbreviated) | Scenario(s) | Coverage |
|---|---|---|---|
| 3.8-a | Receive 20kg, issue 5kg ⇒ remaining 15, ledger IN 20 / OUT 5, on-hand 15 | UAT-J3-02, UAT-INV-02 (receive); UAT-INV-04 (issue); UAT-INV-07 (stock card) | UI |
| 3.8-b | MAV: receive 10@100 then 10@120 ⇒ avg 110; issue 5 posts OUT at 110 | UAT-INV-07 (valuation total) | UI-proxy — valuation figure is UI-visible (with cost permission); the exact moving-average precision is integration |
| 3.8-c | Backflush on producing 100 FG ⇒ FG +100 and RM decremented, one transaction | UAT-PROD-02 (WO completion), UAT-INV-07 (stock card) | UI-proxy — completion is UI; the backflush postings need a BOM set up and are integration-verified (flagged in UAT-PROD-02) |
| 3.8-d | Replaying stock_movement reproduces stock_balance exactly | UAT-INV-07 (stock-card consistency) | Backend — ledger-replay equality is not UI-observable |
| 3.8-e | Adjustment without reason ⇒ 400; with reason ⇒ one audit_log row (actor + reason + before/after) | UAT-J3-05, UAT-INV-06 (no-reason blocked); UAT-J3-04, UAT-INV-06 (with reason); UAT-ADMIN-09 (audit row) | UI |

## M4 — Production Tracking (§4.7)

| # | Acceptance criterion (abbreviated) | Scenario(s) | Coverage |
|---|---|---|---|
| 4.7-a | Scan START ⇒ step IN_PROGRESS, timer; exceeding standard time ⇒ delay emitted, supervisor notified, flagged in timeline | UAT-PROD-02 (START), UAT-PROD-06 (delay flag) | UI |
| 4.7-b | Subcontract a step ⇒ OUTSOURCED + SLA countdown; receive ⇒ timeline continues | UAT-PROD-05 | UI |
| 4.7-c | Completing the final step ⇒ WO COMPLETED and exactly one idempotent backflush | UAT-PROD-02 | UI-proxy — WO COMPLETED is UI; backflush idempotency is integration (needs BOM) |
| 4.7-d | Editing a routing template after a WO exists does not change that WO's materialized steps | — | Backend — no routing-template editor screen is surfaced in the app; not UAT-testable via UI (see §Gaps) |

## M5 — Sales Documents (§5.8)

| # | Acceptance criterion (abbreviated) | Scenario(s) | Coverage |
|---|---|---|---|
| 5.8-a | VatNok ฿100 ⇒ subtotal 100 / VAT 7 / grand 107; VatNai ฿107 ⇒ subtotal 100 / VAT 7 (back-out) | UAT-J1-02, UAT-SALES-04 | UI |
| 5.8-b | Services invoice ฿100,000 + WHT 3% ⇒ certificate 3,000, net transfer 97,000 (+VAT per mode) | UAT-J1-05, UAT-SALES-05 | UI |
| 5.8-c | Convert from APPROVED quotation ⇒ identical lines/prices; quotation CONVERTED; second convert ⇒ 409 | UAT-J1-04, UAT-SALES-02 | UI-proxy (convert + CONVERTED are UI; no second-convert action is the 409 proxy) |
| 5.8-d | Two invoices off one quotation exceeding its subtotal ⇒ 422 on the second | — | Backend — partial-billing over-invoice guard is integration (flagged in UAT-SALES-02) |
| 5.8-e | Void after a receipt exists ⇒ 409; valid void writes audit_log (VOID, reason) | UAT-SALES-08, UAT-ADMIN-09 (audit) | UI |
| 5.8-f | Concurrent document numbering yields zero duplicate doc_no | — | Backend — concurrency/row-lock is not UI-observable |

## M6 — Reporting & Analytics (§6.7)

| # | Acceptance criterion (abbreviated) | Scenario(s) | Coverage |
|---|---|---|---|
| 6.7-a | Clicking "this month" re-filters sibling panels to the same window | UAT-RPT-05 | UI |
| 6.7-b | cost.valuation total = sum over mv_stock_valuation, matching M3 stock cards item-by-item | UAT-RPT-02, UAT-INV-07 (cross-check) | UI-proxy — the valuation total is UI-visible and can be eyeballed against the stock card; exact MV equality is integration |
| 6.7-c | `0 8 * * 1` schedule emails recipients Monday 08:00; send failure retries + in-app alert | UAT-RPT-07 | UI-proxy — schedule create + run-now + retry alert are UI; actual email delivery is backend/async |
| 6.7-d | `report.sales.view` without `inventory.cost.view` ⇒ opens sales, 403 on cost/profit | UAT-RPT-03, UAT-RPT-04 | UI |

---

## Scenarios beyond the §x.8 criteria (workflow coverage)

These UAT scenarios verify capabilities the spec exercises as workflow rather than as a numbered §x.8
bullet (customer/item/employee onboarding, document lifecycles, kiosk lockdown, masking, aging,
schedules-CRUD, provisioning). They trace to the verified module map / UX Acceptance lines and are the
bulk of the golden-path acceptance evidence:

UAT-J1-01/03/06/07, UAT-J2-01/02, UAT-J3-01/03, UAT-INV-01/03/05, UAT-PROD-01/03/04/07,
UAT-SALES-01/03/06/07/09/10, UAT-HR-01/02/04/06/07/11, UAT-RPT-01/06/08/09,
UAT-ADMIN-01/02/03/04/05/06/10.

## Gaps & not-UAT-testable-via-UI (explicit — no silent omissions)

| Area | What UAT cannot prove through the UI | Where it is covered / what UAT does instead |
|---|---|---|
| HR advance→payroll | Auto-deduction of an outstanding advance into payroll (2.8-b) | Cash-advance **disburse has no UI**; net-exact math is still checked in UAT-HR-08. Integration test owns the deduction. |
| HR payslip PDF | Signed-URL expiry + password-protected PDF open (2.8-e) | Integration/PDF layer; UAT checks the in-app breakdown (UAT-HR-10). |
| Inventory costing | Moving-average precision (3.8-b), ledger-replay equality (3.8-d), backflush postings (3.8-c) | Integration; UAT checks stock-card/valuation consistency (UAT-INV-07). |
| Production routing | Template-edit isolation from existing WOs (4.7-d) | No template-editor screen in the app. Flag for product if a UI is expected. |
| Sales guards | Over-invoice 422 (5.8-d), duplicate-free numbering (5.8-f) | Integration; UAT checks lifecycle + void guard by UI. |
| Sales e-Tax | e-Tax XML submission | No UI (UAT-SALES-11 is the documented canary). |
| Reporting | Exact MV valuation equality (6.7-b), real email send (6.7-c) | Integration; UAT checks the UI-visible totals + schedule/run-now. |

These are **not UAT failures** — they are correctly out of UAT's reach and belong to the automated
engineer suite (`docs/testing/` + API integration tests). A tester encountering one should mark the
affected step **N/A (backend)**, never Fail.
