## ADDED Requirements

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
The system SHALL manage `department` (self-referential `parent_id`), `position`
(belonging to a department), and `reporting_line` (an employee's manager) via CRUD
endpoints (perm `hr.employee.manage`).

#### Scenario: Nested departments
- **WHEN** a department is created with a `parent_id`
- **THEN** it is stored as a child of that parent department

#### Scenario: Reporting line links an employee to a manager
- **WHEN** a reporting line is set for an employee
- **THEN** the employee's `manager_employee_id` references the manager employee

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
