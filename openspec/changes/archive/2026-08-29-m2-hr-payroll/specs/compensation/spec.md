## ADDED Requirements

### Requirement: Salary history
The system SHALL record base-salary history via `POST /api/v1/employees/{id}/salary`
`{ base_salary, effective_date }` (perm `hr.salary.edit`), appending a `salary_record` row.
The **current** salary MUST be resolved as the record with the latest `effective_date` that
is on or before today.

#### Scenario: Latest effective record is current
- **WHEN** an employee has salary records effective 2026-01-01 and 2026-06-01 and today is after 2026-06-01
- **THEN** the current base salary is the 2026-06-01 record

#### Scenario: Future-dated record is not yet current
- **WHEN** a salary record has an `effective_date` in the future
- **THEN** it is not treated as the current salary until that date

### Requirement: Pay components (allowances and deductions)
The system SHALL manage `pay_component` (type `ALLOWANCE | DEDUCTION`, default amount,
recurring flag) and per-employee overrides via `employee_pay_component` (amount keyed on
`(employee_id, pay_component_id)`). These feed the payroll net formula.

#### Scenario: Assign a component to an employee
- **WHEN** a pay component is assigned to an employee with an amount
- **THEN** an `employee_pay_component` row is stored for that `(employee, component)` pair

### Requirement: Monetary fields gated by hr.salary.view
The system SHALL omit monetary fields entirely from employee/compensation responses for any
caller who is not a super-admin and lacks `hr.salary.view`. Omitted fields MUST be absent
from the payload, not returned as null.

#### Scenario: Caller without hr.salary.view sees no monetary fields
- **WHEN** a non-super-admin user lacking `hr.salary.view` fetches an employee (or list)
- **THEN** the response contains no base-salary, pay-component, or other monetary fields
- **AND** those fields are absent from the JSON, not present with a null value

#### Scenario: Caller with hr.salary.view sees monetary fields
- **WHEN** a user holding `hr.salary.view` fetches the same employee
- **THEN** the monetary fields are included in the response
