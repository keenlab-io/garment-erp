## ADDED Requirements

### Requirement: WIP bottleneck report
`GET /api/v1/reports/wip` SHALL return, per department, the count of `IN_PROGRESS` steps and
the count of delayed steps, giving a bottleneck view of work in progress.

#### Scenario: WIP report aggregates by department
- **WHEN** the WIP report is requested
- **THEN** the response lists each department with its `in_progress_count` and `delayed_count`

#### Scenario: Delayed steps are reflected in the report
- **WHEN** steps in a department are flagged delayed
- **THEN** that department's `delayed_count` reflects them
