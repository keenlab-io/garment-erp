# UAT Plan — Garment-ERP

Master plan for **User Acceptance Testing** of the Garment-ERP by business stakeholders. It defines
who tests (the business roles and how to provision them), what must exist before testing starts,
how a session is run and recorded, and how the system is formally accepted. The scenario detail
lives in the [journeys](journeys/) and [module scripts](scripts/); results roll up into the
[sign-off](sign-off/) artifacts.

**UAT round — completion checklist**

- [ ] Environment up and super-admin login verified (see [Environment](#environment))
- [ ] Test roles and users provisioned (UAT-ADMIN-02)
- [ ] Master data created per [Test-data prerequisites](#test-data-prerequisites)
- [ ] Journey J1 — Order to cash — executed and recorded
- [ ] Journey J2 — Hire to payslip — executed and recorded
- [ ] Journey J3 — Procure to stock — executed and recorded
- [ ] Module scripts 01–06 executed and recorded
- [ ] Traceability matrix updated with every result
- [ ] Acceptance certificate completed and signed

---

## Purpose & scope

UAT validates that the ERP's six business modules — Admin & Access (M1), HR & Payroll (M2),
Inventory & Costing (M3), Production Tracking (M4), Sales (M5), and Reports & Analytics (M6) —
behave correctly **through the user interface, as a business user works**, so that the business can
formally accept the system. Every scenario is expressed in business terms: create a customer, send a
quotation, receive goods, approve a payroll run. A scenario passes when the outcome is visible on
screen — a document status changes, a receipt is produced, a computed amount is correct.

UAT is the business-acceptance layer. It does not re-test internals: automated engineering tests
(unit, integration, and the browser catalog in [`docs/testing/`](../testing/UI_TEST_PLAN.md)) cover
those. Where an acceptance criterion can only be verified behind the scenes, the
[traceability matrix](sign-off/traceability-matrix.md) flags it honestly as not testable via the UI
rather than pretending a scenario covers it.

**Out of scope / known limitations.** Some flows cannot be fully accepted through the UI today, and
the scenarios say so inline rather than papering over it. **Session-only screens**: the sales
worklist & payments view and the stock counts & adjustments screens only show what was touched in
the current session — there are no "log out, log back in, and confirm it is still there" checks, and
each journey must be run as one uninterrupted session. **Async-job-only outputs**: tax exports
(PND.1 / SSO) and bulk invoice PDF export are accepted at the "export job accepted" confirmation —
no downloaded file is checked. **No-UI capabilities**: e-Tax submission, cash-advance disbursement,
and OT rejection have no screens yet and are flagged as not UAT-testable in the matrix. **No seeded
test people**: the database ships only the super-admin, so every limited-role scenario depends on
first provisioning that role and user (scenario UAT-ADMIN-02).

## Business roles

Eight business roles drive the scenarios. Each maps to a bundle of real system permissions (the only
place permission codes appear in this documentation) and to its nearest engineer-facing persona in
[`docs/testing/UI_TEST_PLAN.md` §Personas](../testing/UI_TEST_PLAN.md#4-personas).

| Business role | Module | Permission bundle | Corresponds to (docs/testing persona) | How to create |
|---|---|---|---|---|
| **Owner / GM** | oversight/approvals | `report.inventory.view, report.sales.view, report.cost.view, report.profit.view, report.tax.view, hr.payroll.approve, hr.ot.approve` (+ note: cash-advance & payroll **approve** actions are additionally **super-admin re-auth-gated** — full end-to-end approval is exercised as the Super Admin) | Reports Viewer + Payroll Approver (no single equivalent) | Role + user via UAT-ADMIN-02 |
| **Accountant** | M5 + tax + payroll | `sales.customer.manage, sales.quotation.manage, sales.invoice.create, sales.invoice.approve, sales.payment.record, sales.document.void, hr.payroll.approve, hr.salary.view, report.sales.view, report.tax.view, report.cost.view` | Sales Supervisor (partial) + Payroll Approver | Role + user via UAT-ADMIN-02 |
| **Sales staff** | M5 | `sales.customer.manage, sales.quotation.manage, sales.invoice.create, sales.payment.record, report.sales.view` | Sales Clerk (plus sales-report viewing) | Role + user via UAT-ADMIN-02 |
| **Warehouse staff** | M3 | `inventory.product.create, inventory.receipt.manage, inventory.issue.manage, inventory.adjustment.approve, report.inventory.view` (deliberately **without** `inventory.cost.view` so cost-masking is demonstrable) | Inventory Operator (plus adjustment approval; costs stay masked) | Role + user via UAT-ADMIN-02 |
| **Production lead** | M4 | `production.wo.manage, production.subcontract.manage` | Production Planner (exact match) | Role + user via UAT-ADMIN-02 |
| **Floor operator** | M4 | `production.scan` **only** (this is the locked-down kiosk persona — no nav chrome) | Production Scanner (exact match) | Role + user via UAT-ADMIN-02 |
| **HR officer** | M2 | `hr.employee.manage, hr.employee.view, hr.ot.approve, hr.salary.view, hr.salary.edit, hr.payslip.view` | HR Officer (broader: adds OT approval and salary handling) | Role + user via UAT-ADMIN-02 |
| **Super Admin / IT** | M1 | seeded `superadmin` (isSuperAdmin) — bypasses every gate; also holds `iam.user.manage, iam.role.manage, iam.audit.view, iam.user.force_logout` semantics | Super Admin (seeded) | Already exists in the seed |

**Bootstrap caveat.** None of the limited roles exist out of the box, and there is no shortcut
around a real login: the developer setting `VITE_DEV_PERMISSIONS` is **not** a login bypass on the
running app (it only shapes automated unit tests). To test any limited role, the Super Admin must
first create the **role** with that permission bundle (Admin → Roles) and a **user** assigned to it
(Admin → Users), then the tester logs in as that user. This provisioning is itself a scenario —
**UAT-ADMIN-02** — and is the setup dependency for every role-gated scenario in this plan. Run it
first.

## Test-data prerequisites

The seeded database is deliberately close to empty on the business side. It ships:

- **One user** — the super-admin (`superadmin`). No other users, no roles.
- **Configuration only** — the full permission catalog; document-number sequences (employees,
  items, quotations VAT/non-VAT, invoices, work orders, receipts); units of measure (PCS, KG, M,
  ROLL); one warehouse ("Main Warehouse"); and the HR payroll configuration (Thai progressive tax
  0–25%, social security 5% within the ฿1,650–15,000 band, OT rates weekday 1.5× and holiday
  1.0×/3.0×, cash-advance ceiling of 50% of base salary over at most 3 installments), all effective
  from 2024-01-01.

There are **no** customers, items, suppliers, employees, work orders, or stock. Every UAT session
therefore begins with the tester (as Super Admin, or a provisioned role that may create master
data) building the master data the scenarios need — customers and items before sales scenarios,
items and a goods receipt before inventory and production scenarios, employees with a base salary
before HR scenarios. Each journey and module script opens with a **Preconditions / test data**
section naming exactly what to create and who creates it; follow it in order.

## Environment

Environment bring-up (infrastructure, database migrate/seed, starting the app) is an IT task and is
documented once in [`docs/testing/UI_TEST_PLAN.md` §Quickstart](../testing/UI_TEST_PLAN.md#quickstart)
— this plan does not repeat it. For the business tester: the application runs at
`http://localhost:5173`, and the first login is the seeded super-admin — username `superadmin`,
password `changeme` (unless IT overrode it via `SEED_SUPERADMIN_PASSWORD`).

## How to run & record a UAT session

1. **Pick the scenario file** — a journey ([`journeys/`](journeys/)) or a module script
   ([`scripts/`](scripts/)) — and read its coverage checklist and Preconditions first.
2. **Prepare** — complete UAT-ADMIN-02 if the scenario needs a limited role, and create the listed
   test data. If a precondition cannot be met, the scenario is **Blocked**, not skipped silently.
3. **Execute in one sitting** — follow the numbered Steps exactly, as the named business role.
   Because several screens are session-only, do not log out or reload mid-journey.
4. **Judge against Expected results** — a scenario **passes only if every numbered expected outcome
   is observed on screen** (the status text, the produced document, the computed amount, the
   confirmation message). One miss means Fail.
5. **Record the result** — tick exactly one box on the scenario's Result line: ☐ Pass ☐ Fail
   ☐ Blocked, with a one-line note. Capture screenshot evidence at each expected outcome (always on
   a failure) into the `debugging/` working folder, named with the scenario id (for example
   `debugging/UAT-SALES-02-invoice-issued.png`), and reference the file in the Result note.
6. **Roll up** — transfer each result into the
   [traceability matrix](sign-off/traceability-matrix.md) and the per-module counts in the
   [acceptance certificate](sign-off/acceptance-certificate.md). Failures become defects, logged
   with the scenario id and a severity from the scale below.

## Entry criteria / Exit criteria

**UAT may start when:**

- The environment is up per the Quickstart and the super-admin login works.
- The database has been freshly migrated and seeded (so document numbering and payroll
  configuration are in a known state).
- UAT-ADMIN-02 has provisioned the business roles and users the planned scenarios need.
- The scenario documents (journeys, scripts, matrix, certificate) are at an agreed version.

**The system is accepted when:**

- Every golden-path scenario (`-02`) and all three journeys (J1, J2, J3) are marked **Pass**.
- Every orientation (`-01`) and role/permission (`-03`) scenario is Pass, and any high-risk (`-04+`)
  failures are dispositioned by the sign-off group.
- There are **no open Critical or High defects**; open Medium/Low defects are listed and accepted
  with target dates.
- The traceability matrix accounts for every acceptance criterion — Pass, Fail with disposition, or
  explicitly flagged as not testable via the UI.
- The acceptance certificate is signed by all three sign-off parties.

## Defect severity scale

| Severity | Definition |
|---|---|
| **Critical** | A golden path or journey cannot be completed, data is lost/corrupted, or money/payroll amounts are computed wrong. |
| **High** | A required business function fails or a permission gate lets a role see or do something it must not — but a workaround exists. |
| **Medium** | A function works but with incorrect secondary behavior (wrong label, wrong status wording, awkward flow) that does not block acceptance. |
| **Low** | Cosmetic — layout, spelling, or polish issues with no business impact. |

## Sign-off process

Three parties sign, each attesting to their own view of the results:

- **Business owner (Owner / GM)** — accepts the system overall: journeys complete, numbers correct,
  no open Critical/High defects.
- **Module owner** — one per module (e.g. Accountant for Sales, HR officer for HR & Payroll,
  Warehouse lead for Inventory) — accepts their module's script results.
- **IT / Super Admin** — attests the environment, seed state, and role provisioning were per this
  plan, so the results are meaningful.

The **[acceptance certificate](sign-off/acceptance-certificate.md) is the artifact of record**: it
carries the per-module Pass/Fail/Blocked rollup and the signature blocks. A signed certificate,
together with the completed traceability matrix, constitutes formal acceptance of the release under
test.

## Document map

| Document | What it is |
|---|---|
| [`README.md`](README.md) | Index of this folder; how UAT relates to the engineer-facing `docs/testing/` |
| [`journeys/J1-order-to-cash.md`](journeys/J1-order-to-cash.md) | Cross-module journey: customer → quotation → invoice → stock issue → payment → receipt |
| [`journeys/J2-hire-to-payslip.md`](journeys/J2-hire-to-payslip.md) | Cross-module journey: employee onboarding → OT approval → payroll calculate → approve → payslip |
| [`journeys/J3-procure-to-stock.md`](journeys/J3-procure-to-stock.md) | Cross-module journey: item → goods receipt with landed cost → stock count → adjustment |
| [`scripts/01-inventory.md`](scripts/01-inventory.md) | Inventory & Costing (M3) scenarios |
| [`scripts/02-production.md`](scripts/02-production.md) | Production Tracking (M4) scenarios |
| [`scripts/03-sales.md`](scripts/03-sales.md) | Sales (M5) scenarios |
| [`scripts/04-hr.md`](scripts/04-hr.md) | HR & Payroll (M2) scenarios |
| [`scripts/05-reports.md`](scripts/05-reports.md) | Reports & Analytics (M6) scenarios |
| [`scripts/06-admin.md`](scripts/06-admin.md) | Admin & Access (M1) scenarios, including the UAT-ADMIN-02 role bootstrap |
| [`sign-off/traceability-matrix.md`](sign-off/traceability-matrix.md) | Scenario ↔ specification criterion ↔ result, with not-UI-testable items flagged |
| [`sign-off/acceptance-certificate.md`](sign-off/acceptance-certificate.md) | Per-module rollup + signature blocks — the artifact of record |
