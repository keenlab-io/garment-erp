## ADDED Requirements

### Requirement: Payroll run lifecycle, one per period
The system SHALL manage `payroll_run` with a unique `period` (`YYYY-MM`) through
`DRAFT → CALCULATED → APPROVED → PAID → CLOSED` with **no backward transitions**.
`POST /api/v1/payroll-runs` `{ period }` creates a DRAFT; creating a second run for the same
period MUST be rejected with 409.

#### Scenario: One run per period
- **WHEN** a payroll run already exists for period `2026-07` and another is created for `2026-07`
- **THEN** the second create is rejected with 409 STATE_CONFLICT

#### Scenario: No backward transition
- **WHEN** an APPROVED run is asked to return to DRAFT/CALCULATED
- **THEN** the transition is rejected with 409 STATE_CONFLICT

### Requirement: Asynchronous calculate with immutable breakdown snapshot
`POST /api/v1/payroll-runs/{id}/calculate` SHALL run as an asynchronous job, returning
202 `{ job_id }`. The job MUST build one `payslip` per active employee, snapshotting every
input (base, OT, allowances, deductions, sso, tax, advance) into `payslip.breakdown`. The
breakdown becomes **immutable once the run is APPROVED**; recalculation is permitted only
while DRAFT/CALCULATED. The calculate job MUST be idempotent on `run_id` (no double-posting
on re-run).

#### Scenario: Calculate returns a job id
- **WHEN** a user triggers calculate on a DRAFT run
- **THEN** the response is 202 with a `job_id` and payslips are built asynchronously

#### Scenario: Recalculation blocked after approval
- **WHEN** calculate is triggered on an APPROVED run
- **THEN** the request is rejected with 409 STATE_CONFLICT

#### Scenario: Re-running calculate does not double-post
- **WHEN** the calculate job runs twice for the same run
- **THEN** each employee still has exactly one payslip for that run (`unique(run_id, employee_id)` upsert)

### Requirement: Canonical net-pay formula
Each payslip's net SHALL equal, to the cent,
`net = (base + Σ allowances + ot_pay) − (sso + withholding_tax + advance_repayment + Σ other_deductions)`.
Money MUST be computed with decimal arithmetic (no float), rounded half-up at the cent.

#### Scenario: Net matches the formula to the cent
- **WHEN** a payslip is calculated
- **THEN** its `net` equals the canonical formula applied to its `breakdown` inputs, to the cent

### Requirement: Approval pulls advances and is single-shot
`POST /api/v1/payroll-runs/{id}/approve` (perm `hr.payroll.approve`) SHALL transition
CALCULATED → APPROVED, pull outstanding advances into deductions (decrementing
`cash_advance.outstanding`), and be idempotent against double approval — a second approve
MUST return 409.

#### Scenario: Approving twice conflicts
- **WHEN** an already-APPROVED run is approved again
- **THEN** the second call is rejected with 409 STATE_CONFLICT

#### Scenario: Approval auto-inserts outstanding advances
- **WHEN** a run is approved and an employee has an outstanding advance
- **THEN** the advance is inserted into that employee's deduction line and `outstanding` is decremented

### Requirement: Statutory export inputs (non-authoritative)
The system SHALL provide `GET /api/v1/payroll/exports/pnd1?period=` and `/sso?period=`
returning 202 `{ job_id }` for async file generation. These outputs are **non-authoritative**
inputs for accountant confirmation, computed from configurable parameters.

#### Scenario: Export returns a job id
- **WHEN** a PND.1 or SSO export is requested for a period
- **THEN** the response is 202 with a `job_id` and the file is generated asynchronously
