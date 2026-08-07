# UAT Acceptance Certificate

The artifact of record for a UAT round. Fill in one result per scenario, roll the results up per
module, then have each signatory accept, conditionally accept, or reject. Attach the executed scenario
files (with their ☐ Pass/Fail/Blocked marks) and any screenshots from `debugging/` as evidence.

- **System / release under test**: ____________________  (build / commit: ____________)
- **UAT round**: ☐ Round 1  ☐ Re-test  —  **Date(s)**: ____________  **Environment**: ____________
- **Test lead**: ____________________

**Result values**: **Pass** (every Expected observed) · **Fail** (a business outcome was wrong) ·
**Blocked** (could not run — e.g. missing test data or a dependency scenario failed) · **N/A**
(backend-only step, per the traceability matrix). Defect severities per `UAT_PLAN.md`.

---

## 1. Journey results (cross-module — the primary acceptance evidence)

| Journey | Scenarios | Pass | Fail | Blocked | Verdict | Notes / defect ids |
|---|---|---|---|---|---|---|
| **J1 — Order to cash** | UAT-J1-01 … 07 (7) | | | | ☐ Accept ☐ Reject | |
| **J2 — Hire to payslip** | UAT-J2-01 … 05 (5) | | | | ☐ Accept ☐ Reject | |
| **J3 — Procure to stock** | UAT-J3-01 … 05 (5) | | | | ☐ Accept ☐ Reject | |

## 2. Module script results

| Module | Scenarios | Pass | Fail | Blocked | Verdict | Notes / defect ids |
|---|---|---|---|---|---|---|
| **01 — Inventory & Costing** | UAT-INV-01 … 07 (7) | | | | ☐ Accept ☐ Reject | |
| **02 — Production Tracking** | UAT-PROD-01 … 07 (7) | | | | ☐ Accept ☐ Reject | |
| **03 — Sales** | UAT-SALES-01 … 11 (11) | | | | ☐ Accept ☐ Reject | |
| **04 — HR & Payroll** | UAT-HR-01 … 11 (11) | | | | ☐ Accept ☐ Reject | |
| **05 — Reports & Analytics** | UAT-RPT-01 … 09 (9) | | | | ☐ Accept ☐ Reject | |
| **06 — Admin & Access** | UAT-ADMIN-01 … 11 (11) | | | | ☐ Accept ☐ Reject | |

**Scenario totals**: 17 journey + 56 module = **73 scenarios**.

## 3. Open defects at sign-off

| Defect id | Scenario | Severity (Crit/High/Med/Low) | Summary | Status |
|---|---|---|---|---|
| | | | | |

> **Exit rule (from `UAT_PLAN.md`)**: the system is **Accepted** only when every journey and every
> golden-path scenario is **Pass** and there are **no open Critical or High** defects. Medium/Low
> defects may be carried with an agreed remediation plan (**Conditional acceptance**).

---

## 4. Overall verdict

- ☐ **Accepted** — meets acceptance criteria; approved for release.
- ☐ **Conditionally accepted** — accepted with the Medium/Low defects above and this remediation plan:
  ____________________________________________________________________
- ☐ **Rejected** — one or more Critical/High defects or a failed journey; re-test required.

## 5. Signatures

The scope each party accepts is their own module/area plus the cross-module journeys.

| Role | Name | Accept / Conditional / Reject | Signature | Date |
|---|---|---|---|---|
| **Business owner / sponsor** | | | | |
| **Module owner — Sales / Accounting** | | | | |
| **Module owner — HR & Payroll** | | | | |
| **Module owner — Inventory / Production** | | | | |
| **IT / Super Admin** | | | | |

---

*Evidence attached: executed scenario files under `docs/uat/` and screenshots under `debugging/`.
Backend-only criteria (see `traceability-matrix.md` §Gaps) are out of UAT scope and are covered by the
engineer/integration suite — they are not counted against acceptance.*
