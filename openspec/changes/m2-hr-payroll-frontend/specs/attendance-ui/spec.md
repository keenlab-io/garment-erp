## ADDED Requirements

### Requirement: Attendance import and monthly grid
The system SHALL provide an attendance import and a monthly grid view keyed by employee and work
date, gated by `hr.employee.manage`.

#### Scenario: Import attendance
- **WHEN** an attendance file is imported
- **THEN** the monthly grid reflects the imported records per employee and date

#### Scenario: Review the monthly grid
- **WHEN** the attendance grid is opened for a period
- **THEN** each employee's daily attendance is shown for that month
