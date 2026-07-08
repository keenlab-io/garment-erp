## ADDED Requirements

### Requirement: Payroll run wizard
The payroll run workspace SHALL be a wizard: **Inputs** (employees in scope; missing-data flags
that must be resolved or excluded), **Calculate** (async job → payslip preview with
base/OT/allowances/deductions/SSO/tax/advance/NET columns), **Review** (sortable/searchable with
outliers auto-flagged), **Approve** (guarded, perm `hr.payroll.approve`).

#### Scenario: Missing data blocks calculation
- **WHEN** employees in scope have missing salary or unreconciled OT
- **THEN** the Inputs step flags them and requires resolving or excluding before calculating

#### Scenario: Outliers are flagged before approval
- **WHEN** a computed net pay is ≤ 0 or greater than twice base
- **THEN** that row shows a warning chip in Review

#### Scenario: Approval is guarded and states its consequence
- **WHEN** a user with `hr.payroll.approve` approves the run
- **THEN** a confirm dialog states that it locks the run, pulls outstanding advances, and generates payslips

### Requirement: Transparent payslip breakdown
Clicking a payslip row SHALL open a read-only drawer that shows every term of the net-pay formula
line by line; masked for users without `hr.salary.view`.

#### Scenario: Breakdown shows the full formula
- **WHEN** a payslip row is opened
- **THEN** the drawer lists each term of the net-pay computation with no hidden math
