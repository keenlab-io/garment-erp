# UAT — User Acceptance Testing

This folder is the **business-acceptance layer** of Garment-ERP testing. It is written for the
people who will run the business on the system — owner, accountant, sales staff, warehouse staff,
production lead, floor operator, HR officer — not for engineers. Every scenario describes a business
outcome ("record a full payment against the invoice and receive a receipt") and is judged by what is
visible on screen: document statuses, produced documents, computed amounts, confirmations. Results
roll up through a traceability matrix into a signed acceptance certificate, which is the formal
record that the business accepts the system. Start with [`UAT_PLAN.md`](UAT_PLAN.md).

This is a separate layer from [`docs/testing/`](../testing/UI_TEST_PLAN.md), the engineer/QA
catalog: that plan and its test cases are keyed to permission CSVs, selectors, and automation
tooling (Playwright, Storybook, Claude for Chrome), and it owns environment bring-up. UAT documents
deliberately contain none of that vocabulary — they reference `docs/testing/` for setup (its
§Quickstart) and its personas (each UAT business role names its nearest engineering persona), but
never restate ports, commands, or selectors. If a UAT scenario fails, the matching `docs/testing/`
test case is where engineers turn it into a repeatable regression check.

## Files

```
docs/uat/
  README.md                      # this index
  UAT_PLAN.md                    # master plan: scope, business roles + provisioning, test-data
                                 #   prerequisites, how to run & record, entry/exit criteria,
                                 #   defect severity, sign-off process
  journeys/
    J1-order-to-cash.md          # customer → quotation → invoice → stock issue → payment → receipt
    J2-hire-to-payslip.md        # employee onboarding → OT approval → payroll calculate → approve → payslip
    J3-procure-to-stock.md       # item → goods receipt with landed cost → stock count → adjustment
  scripts/
    01-inventory.md              # Inventory & Costing (M3) scenarios
    02-production.md             # Production Tracking (M4) scenarios
    03-sales.md                  # Sales (M5) scenarios
    04-hr.md                     # HR & Payroll (M2) scenarios
    05-reports.md                # Reports & Analytics (M6) scenarios
    06-admin.md                  # Admin & Access (M1) scenarios, incl. the role-bootstrap (UAT-ADMIN-02)
  sign-off/
    traceability-matrix.md       # scenario ↔ spec criterion ↔ result; not-UI-testable items flagged
    acceptance-certificate.md    # per-module Pass/Fail/Blocked rollup + signatures — artifact of record
```
