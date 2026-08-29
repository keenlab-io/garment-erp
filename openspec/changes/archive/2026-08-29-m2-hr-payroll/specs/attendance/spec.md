## ADDED Requirements

### Requirement: Attendance import
The system SHALL accept `POST /api/v1/attendance/import` (multipart Excel/CSV, perm
`hr.employee.manage`) that upserts `attendance` rows keyed on `(employee_id, work_date)`
with `clock_in`/`clock_out` and `source`. The response MUST report `{ rows_imported }`.
Re-importing the same `(employee, work_date)` MUST update the existing row rather than
duplicate it.

#### Scenario: Import creates attendance rows
- **WHEN** a valid attendance file is uploaded
- **THEN** one `attendance` row per `(employee, work_date)` is created and `rows_imported` reports the count

#### Scenario: Re-import updates in place
- **WHEN** a file re-imports a `(employee, work_date)` already present
- **THEN** the existing row is updated (no duplicate is created, PK `(employee_id, work_date)` holds)

### Requirement: Attendance feeds OT reconciliation
Imported `attendance` SHALL be the source of attended hours used when reconciling OT
requests.

#### Scenario: Attended hours available for reconciliation
- **WHEN** attendance for an employee's `work_date` is imported
- **THEN** the attended hours for that date are available to OT reconciliation
