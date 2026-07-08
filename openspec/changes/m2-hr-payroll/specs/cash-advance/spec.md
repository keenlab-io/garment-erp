## ADDED Requirements

### Requirement: Cash-advance request with ceiling check
The system SHALL accept `POST /api/v1/cash-advances` `{ employee_id, amount, reason,
repayment_plan }`. At submission the requested `amount` MUST be checked against the
configured ceiling (e.g. a percentage of base salary or a tenure-based limit); a request
over the ceiling MUST be rejected with 422 BUSINESS_RULE. A valid request is stored with
status `SUBMITTED`.

#### Scenario: Over-ceiling request is rejected
- **WHEN** a cash advance is requested for an amount exceeding the configured ceiling
- **THEN** the request is rejected with 422 BUSINESS_RULE and no advance is created

#### Scenario: Within-ceiling request is submitted
- **WHEN** a cash advance within the ceiling is requested
- **THEN** a `cash_advance` row is created with status `SUBMITTED`

### Requirement: Super-admin approval and disbursement
Approval of a cash advance (`POST /api/v1/cash-advances/{id}/approve`) SHALL require a
super-admin (`is_super_admin`); a non-super-admin MUST be rejected with 403.
`POST /api/v1/cash-advances/{id}/disburse` transitions APPROVED → DISBURSED and sets
`outstanding = amount`. The lifecycle is
`SUBMITTED → APPROVED → DISBURSED → REPAYING → CLEARED` with a `REJECTED` branch.

#### Scenario: Only a super-admin can approve
- **WHEN** a non-super-admin attempts to approve a cash advance
- **THEN** the request is rejected with 403

#### Scenario: Disbursement sets the outstanding balance
- **WHEN** an APPROVED advance is disbursed
- **THEN** its status becomes DISBURSED and `outstanding` equals the advance `amount`

### Requirement: Auto-deduction at payroll approval
When a payroll run is approved, each employee's outstanding cash advance SHALL be pulled
into that period's deductions and `cash_advance.outstanding` decremented accordingly; an
advance whose `outstanding` reaches zero MUST transition to `CLEARED`.

#### Scenario: Outstanding advance is deducted and cleared
- **WHEN** a payroll run is approved for an employee with an outstanding advance fully covered by the period's deduction
- **THEN** the advance amount is deducted in that payslip, `outstanding` becomes 0, and the advance transitions to CLEARED

#### Scenario: Partial repayment leaves the advance repaying
- **WHEN** the period deduction only partially covers the outstanding balance
- **THEN** `outstanding` is decremented by the deducted amount and the advance remains in REPAYING
