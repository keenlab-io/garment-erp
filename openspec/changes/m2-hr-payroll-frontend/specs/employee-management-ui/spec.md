## ADDED Requirements

### Requirement: Employee list and tabbed detail
The system SHALL provide an employees list (Data Table) and a tabbed employee detail (Profile ·
Documents · Salary · Pay components · Reporting), gated by `hr.employee.view`/`hr.employee.manage`.
Documents are a secure list with signed-URL download (no inline render of ID documents).

#### Scenario: View employee detail
- **WHEN** a user with `hr.employee.view` opens an employee
- **THEN** the tabbed detail shows profile, documents, salary, pay components, and reporting line

#### Scenario: Documents download via signed URL
- **WHEN** the Documents tab is opened
- **THEN** files are listed and downloaded via signed URLs rather than rendered inline

### Requirement: Salary figures are masked without permission
Salary and pay figures SHALL render as `••••` with a lock for users lacking `hr.salary.view`,
keeping the layout stable; the real value is never placed in the DOM when masked.

#### Scenario: Unauthorized user sees masked salary
- **WHEN** a user without `hr.salary.view` opens an employee
- **THEN** salary/pay fields show a masked placeholder with a lock, and layout is unchanged

#### Scenario: Authorized user sees salary
- **WHEN** a user with `hr.salary.view` opens the same employee
- **THEN** the salary figures are shown
