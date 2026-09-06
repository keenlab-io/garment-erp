## MODIFIED Requirements

### Requirement: Organization structure
The system SHALL manage `department` (self-referential `parent_id`) and `position`
(belonging to a department) through full CRUD: `GET`/`POST /api/v1/departments` and
`/api/v1/positions` (create perm `hr.employee.manage`, read perm `hr.employee.view`),
`PUT /api/v1/departments/{id}` and `PUT /api/v1/positions/{id}` (partial bodies; provided
fields replace stored values), and `DELETE` on both (perm `hr.employee.manage`, `204`).

Update MUST allow renaming, re-parenting a department, and moving a position to another
department; employees assigned to a moved position keep that assignment. A department MUST
NOT become its own ancestor — a re-parent that would create a cycle (including
self-reference) MUST be rejected with 422 BUSINESS_RULE and no change applied.

Delete MUST be a soft delete (`deleted_at`), MUST NOT cascade, and MUST be refused with 409
STATE_CONFLICT while live rows still reference the target: a department with live child
departments or live positions, or a position still held by any employee. Soft-deleted
departments and positions MUST be absent from the list endpoints while remaining resolvable
for rows that already reference them. Every update and delete MUST append an `audit_log` row
(`UPDATE`/`DELETE` on `department`/`position`) carrying `before` and `after`, atomically with
the mutation.

#### Scenario: Nested departments
- **WHEN** a department is created with a `parent_id`
- **THEN** it is stored as a child of that parent department

#### Scenario: Rename and re-parent a department
- **WHEN** a user with `hr.employee.manage` sends `PUT /departments/{id}` with a new `name` and `parent_id`
- **THEN** both fields are updated and an `UPDATE` audit row is appended with the previous and new values

#### Scenario: Re-parenting into own subtree is rejected
- **WHEN** a department is re-parented to itself or to one of its descendants
- **THEN** the request is rejected with 422 BUSINESS_RULE and the stored `parent_id` is unchanged

#### Scenario: Moving a position keeps its employees
- **WHEN** a position's `department_id` is changed
- **AND** employees hold that position
- **THEN** the position moves and those employees remain assigned to it

#### Scenario: Deleting an occupied position is refused
- **WHEN** a position still assigned to at least one employee is deleted
- **THEN** the request is rejected with 409 STATE_CONFLICT and no employee's `position_id` is modified

#### Scenario: Deleting a department with live children is refused
- **WHEN** a department that still has a live child department or a live position is deleted
- **THEN** the request is rejected with 409 STATE_CONFLICT

#### Scenario: Soft delete removes the row from listings
- **WHEN** an unreferenced position is deleted
- **THEN** it is stamped `deleted_at`, disappears from `GET /positions`, and a `DELETE` audit row is appended

## ADDED Requirements

### Requirement: Reporting line management
The system SHALL expose `GET /api/v1/employees/{id}/reporting-line` (perm
`hr.employee.view`) returning that employee's manager and their direct reports as
`{ manager, direct_reports }`, where each entry carries `{ id, emp_code, first_name,
last_name }` only — never salary or PII fields — and `manager` is `null` when unset.

The system SHALL expose `PUT /api/v1/employees/{id}/reporting-line` (perm
`hr.employee.manage`) with body `{ manager_employee_id }`, upserting the `reporting_line`
row keyed on `employee_id`; a `null` manager clears the reporting line. An employee MUST NOT
be their own manager directly or transitively — a manager assignment that would create a
cycle MUST be rejected with 422 BUSINESS_RULE. Each write MUST append an `UPDATE` audit row
for `reporting_line`.

#### Scenario: Reporting line links an employee to a manager
- **WHEN** a reporting line is set for an employee
- **THEN** the employee's `manager_employee_id` references the manager employee
- **AND** the manager appears in that employee's `GET /reporting-line` response

#### Scenario: Direct reports read back
- **WHEN** two employees name the same manager
- **THEN** the manager's `GET /reporting-line` lists both as `direct_reports`

#### Scenario: Setting a manager twice updates one row
- **WHEN** an employee who already has a manager is given a different one
- **THEN** the existing `reporting_line` row is updated rather than duplicated

#### Scenario: Clearing a reporting line
- **WHEN** `manager_employee_id` is sent as `null`
- **THEN** the employee has no manager and no longer appears under the former manager's direct reports

#### Scenario: Managerial cycles are rejected
- **WHEN** an employee is assigned a manager who reports to them directly or transitively
- **THEN** the request is rejected with 422 BUSINESS_RULE and the stored reporting line is unchanged

#### Scenario: Reporting line exposes no salary or PII
- **WHEN** a user with `hr.employee.view` but not `hr.salary.view` reads a reporting line
- **THEN** the response contains only identity fields for the manager and direct reports
