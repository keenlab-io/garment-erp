# Journey J2 — Hire to Payslip (HR-led)

From a signed contract to a correct payslip: this journey follows one new employee through the
HR & Payroll module (M2). The story: **Ms. Suda** joins as a monthly-paid sewing-line employee at
a base salary of ฿30,000. In her first month she works one weekday evening of overtime — she asks
for 3 hours, but attendance shows she actually stayed 2 — and the system must pay the 2 hours,
not the 3. Payroll is then run through the four-step wizard, the payslip breakdown is reviewed
line by line, and the run is approved under the guarded approval step. Finally we prove the
system refuses to approve the same payroll twice.

**Coverage checklist**

- [ ] Employee onboarded with base salary — Probation → Active (UAT-J2-01)
- [ ] OT request submitted and approved — Submitted → Approved (UAT-J2-02)
- [ ] OT reconciled against attendance: 3h requested, 2h attended ⇒ 2h payable (UAT-J2-03)
- [ ] Payroll wizard: Inputs → Calculate → Review, payslip breakdown verified (UAT-J2-04)
- [ ] Guarded payroll approval; second approval refused as already approved (UAT-J2-05)

**Who runs it.** Written from the HR officer's point of view; the payroll approval step
additionally requires the super-admin's re-authorization, so the whole journey is executed as
the seeded super-admin in one sign-in (see the roles table and bootstrap caveat in
[../UAT_PLAN.md](../UAT_PLAN.md)). Role-by-role permission acceptance — including salary-figure
masking for users without salary rights — is covered in the HR module script. Environment
bring-up: see [`docs/testing/UI_TEST_PLAN.md` §Quickstart](../../testing/UI_TEST_PLAN.md).

Status names used below are the system's real lifecycle states — employee: PROBATION → ACTIVE;
OT request: SUBMITTED → APPROVED → RECONCILED; payroll run: DRAFT → CALCULATED → APPROVED.

**Honesty notes.** (1) Rejecting an OT request is not possible from the screens today
(approve/reconcile only) — rejection is out of scope for this journey and flagged in the
traceability matrix. (2) The exact baht value of the OT earnings line depends on the configured
hourly-rate derivation for monthly employees; this journey asserts the **hours and rate tier**
(2 hours at the weekday 1.5× rate), and the tester records the displayed amount as evidence.

---

### UAT-J2-01 — New employee onboarded with a base salary
- **Business role**: HR officer
- **Business goal**: Put a new hire on the books with everything payroll will need.
- **Preconditions / test data**: Signed in. The seed contains no employees — this scenario
  creates the first one. Seeded payroll configuration (Thai progressive tax, SSO, OT rates) is
  already in place.
- **Steps**:
  1. Open **HR → Employees** and create a new employee: name **Suda Jaidee**, employment type
     **Monthly**, base salary **30,000**, start date this month.
  2. Read the new employee's status.
  3. If the employee is created in **Probation** status, update her status to **Active** (a
     probation-period employee still appears in payroll; Active is her steady state for the rest
     of the journey).
- **Expected result**:
  1. The employee is created with a system-generated employee code (EXT-series) and appears in
     the employee list.
  2. Her status chip reads **Probation** on creation (or **Active** if set directly), and
     **Active** after step 3.
  3. Her record shows the ฿30,000 base salary; she is **not** flagged as "missing salary" (an
     employee without a base salary would be flagged and would block payroll later).
- **Acceptance criterion**: The employee exists in Active status with a recorded ฿30,000 base
  salary and no missing-salary flag.
- **Traces to**: M2 employee-onboarding workflow — "EmployeeStatus PROBATION → ACTIVE …; base
  salary required for payroll (flagged 'missing salary')" (verified workflow; journey
  prerequisite — no dedicated §2.8 bullet).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J2-02 — Overtime request submitted and approved
- **Business role**: HR officer (submitting on the employee's behalf), Owner/GM (approving)
- **Business goal**: Get a weekday overtime request onto the books and approved before payroll.
- **Preconditions / test data**: UAT-J2-01 complete. Same session.
- **Steps**:
  1. Open **HR → Overtime** and create an OT request for **Suda Jaidee**: a weekday in the
     current pay period, **3 hours** requested. Submit it.
  2. Approve the submitted request.
- **Expected result**:
  1. After submitting: the request appears in the OT list with status **Submitted**, showing
     3 requested hours at the weekday rate (1.5×).
  2. After approving: the status chip reads **Approved**.
- **Acceptance criterion**: The OT request reaches Approved with 3 requested hours on record.
- **Traces to**: M2 OT workflow — "OtRequestStatus DRAFT → SUBMITTED → APPROVED → RECONCILED
  (approved = min(requested, attended))" (verified workflow; the reconcile arithmetic itself is
  UAT-J2-03).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J2-03 — OT reconciled against attendance: 3 hours asked, 2 hours worked, 2 hours paid
- **Business role**: HR officer
- **Business goal**: Make sure the company pays for the overtime actually worked, not the hours
  requested.
- **Preconditions / test data**: The Approved 3-hour OT request from UAT-J2-02. Same session.
- **Steps**:
  1. Open **HR → Attendance** and record Suda's attendance for the OT day showing **2 hours** of
     overtime actually worked (she left an hour early).
  2. Reconcile the OT request for the period.
  3. Read the request's status and its approved-hours figure.
- **Expected result**:
  1. The request's status chip reads **Reconciled**.
  2. Its payable/approved hours show **2** — the lesser of hours requested (3) and hours
     attended (2).
- **Acceptance criterion**: Reconciliation sets the payable overtime to exactly 2 hours; the
  extra requested hour is not payable.
- **Traces to**: BACKEND_SPEC M2 §2.8 — "OT requested 3h, attendance 2h ⇒ reconcile sets
  approved_hours=2, pay reflects 2h." (First half verified here; "pay reflects 2h" is verified
  in UAT-J2-04.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J2-04 — Payroll calculated and the payslip breakdown reviewed
- **Business role**: HR officer (running), Accountant (reviewing figures)
- **Business goal**: Calculate the month's payroll and confirm the payslip is right before
  anyone approves it.
- **Preconditions / test data**: UAT-J2-01–03 complete: one Active employee with a ฿30,000 base
  salary and one Reconciled OT request (2 payable hours). Same session.
- **Steps**:
  1. Open **HR → Payroll** and start a new payroll run for the current period — the wizard's
     **Inputs** step. Read any blocking flags shown.
  2. Proceed to **Calculate**.
  3. On the **Review** step, open Suda's payslip breakdown and read it line by line. Stop here —
     do not approve yet.
- **Expected result**:
  1. Inputs: no blocking flags — no employee is missing a salary, and no OT is left
     unreconciled. (Had UAT-J2-03 been skipped, an unreconciled-OT flag would block progress
     here — that guard is the point of the step.)
  2. After Calculate: the run's status chip reads **Calculated** (it was **Draft** on creation).
  3. Review shows Suda's payslip breakdown:
     - Base salary earnings of **30,000.00**;
     - an OT earnings line for **2 hours** at the weekday **1.5×** rate (2 hours — not the 3
       requested; record the displayed amount as evidence);
     - an SSO deduction of **750.00** (5% capped at the ฿15,000 wage ceiling);
     - a withholding-tax deduction per the configured progressive table;
     - a net pay figure stated to the satang, consistent with earnings minus deductions.
- **Acceptance criterion**: The run reaches Calculated and Suda's payslip pays overtime for
  exactly 2 hours, with statutory deductions (SSO ฿750) and an exact net figure.
- **Traces to**: BACKEND_SPEC M2 §2.8 — "…pay reflects 2h" (from the OT reconcile bullet) and
  "…net exact to the cent" (from the payroll bullet; the advance-deduction portion of that
  bullet is not exercised here — no cash advance exists in this journey).
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:

### UAT-J2-05 — Payroll approved under guard; approving twice is refused
- **Business role**: Owner/GM (business approval) executed as Super Admin (the approval is
  re-authorization-gated)
- **Business goal**: Formally approve the payroll run, and prove the system will not let the
  same payroll be approved twice.
- **Preconditions / test data**: The Calculated run from UAT-J2-04, reviewed and correct. Same
  session.
- **Steps**:
  1. On the wizard's **Approve** step, approve the run. Complete the guarded confirmation —
     this is a protected action requiring the super-admin's re-authorization; confirm
     deliberately.
  2. Attempt to approve the same run a second time (re-invoke the approval on the same run).
- **Expected result**:
  1. The approval asks for explicit confirmation/re-authorization before proceeding; after
     confirming, the run's status chip reads **Approved** and the payslips are final.
  2. The second attempt is refused with an error explaining the run is already approved — the
     run remains Approved once, with no duplicate approval recorded.
- **Acceptance criterion**: The run reaches Approved exactly once; a repeat approval is rejected
  with an "already approved" error and changes nothing.
- **Traces to**: BACKEND_SPEC M2 §2.8 — "Approving a payroll run twice ⇒ second call 409."
  (Verified in the UI as the already-approved error message; the 409 status code itself is
  backend detail.)
- **Result**: ☐ Pass ☐ Fail ☐ Blocked — Notes / evidence:
