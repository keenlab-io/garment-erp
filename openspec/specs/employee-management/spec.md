# Employee Management

## Purpose
The employee master — auto-issued codes, tabbed detail with optimistic update, status lifecycle, organization structure, stored documents, and probation-ending alerts.

## Requirements

### Requirement: Employee master with auto-issued emp_code
The system SHALL manage employees with `POST /api/v1/employees` `{ first_name, last_name,
national_id, employment_type, position_id, hire_date, profile }` (perm `hr.employee.manage`)
and `GET /api/v1/employees` (perm `hr.employee.view`, cursor-paginated, optional
`filter[status]`). On create the system MUST issue a unique `emp_code` via SequenceService
(`EXT0001`-style) and emit `EmployeeCreated`. The response MUST return the created employee.

#### Scenario: Create issues an emp_code and emits an event
- **WHEN** a user with `hr.employee.manage` creates an employee
- **THEN** the employee is persisted with a unique `emp_code` rendered as `EXT` + a zero-padded sequence
- **AND** an `EmployeeCreated` event is emitted

#### Scenario: Paginated, status-filtered listing
- **WHEN** a user with `hr.employee.view` calls `GET /employees?filter[status]=ACTIVE&limit=50`
- **THEN** only ACTIVE employees are returned in the `{ data, next_cursor }` shape

### Requirement: Employee detail and optimistic update
The system SHALL expose `GET /api/v1/employees/{id}` (perm `hr.employee.view`) and
`PUT /api/v1/employees/{id}` (perm `hr.employee.manage`) guarded by `If-Match` on the
employee `version`. A stale `If-Match` MUST be rejected with 409 STATE_CONFLICT.

#### Scenario: Update with a current version succeeds
- **WHEN** a user updates an employee sending the current `version` in `If-Match`
- **THEN** the update is applied and the `version` is incremented

#### Scenario: Update with a stale version conflicts
- **WHEN** the `If-Match` version does not match the stored `version`
- **THEN** the request is rejected with 409 STATE_CONFLICT and no change is applied

### Requirement: Employee status lifecycle
Each employee SHALL have a status in `PROBATION | ACTIVE | RESIGNED | SUSPENDED`, defaulting
to `PROBATION` on creation.

#### Scenario: New employees start in probation
- **WHEN** an employee is created without an explicit status
- **THEN** the stored status is `PROBATION`

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

### Requirement: Employee documents via object storage
The system SHALL accept `POST /api/v1/employees/{id}/documents` (multipart, perm
`hr.employee.manage`) storing the file via `StorageService` and recording an
`employee_document` row with the object `file_key`. Documents MUST be accessible only via
signed URLs, never a public path.

#### Scenario: Upload stores the file and returns a key
- **WHEN** a document is uploaded for an employee
- **THEN** the file is stored via `StorageService` and an `employee_document` row is created with its `file_key`
- **AND** the response returns the `file_key`

### Requirement: Probation-ending alert
The system SHALL run a scheduled job that, N days before an employee's `probation_end_date`,
emits `ProbationEnding` so managers can be notified. N MUST be configurable.

#### Scenario: Alert fires ahead of probation end
- **WHEN** the scheduled job runs and an employee's `probation_end_date` is within the configured N days
- **THEN** a `ProbationEnding` event is emitted for that employee

#### Scenario: No alert outside the window
- **WHEN** the scheduled job runs and no employee's `probation_end_date` is within N days
- **THEN** no `ProbationEnding` event is emitted
