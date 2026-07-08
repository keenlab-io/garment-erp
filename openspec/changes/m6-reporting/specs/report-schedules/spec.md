## ADDED Requirements

### Requirement: Report schedule management
`GET/POST/PUT/DELETE /api/v1/report-schedules` (perm `report.schedule.manage`) SHALL manage
`report_schedule` rows (`name`, `report_key`, `cron`, `recipients`, `format`, `params`,
`is_active`). Creating, updating, or activating a schedule SHALL register a **repeatable** job
for it driven by its `cron`; deleting or deactivating it SHALL remove that job — the table is
the source of truth.

#### Scenario: Creating an active schedule registers its cron job
- **WHEN** an active report schedule is created with a cron expression
- **THEN** the `report_schedule` row is stored and a repeatable job is registered for that cron

#### Scenario: Deactivating a schedule removes its job
- **WHEN** a schedule is deactivated or deleted
- **THEN** its repeatable job is removed

### Requirement: Scheduled digest delivery
On its cron cadence, a schedule SHALL render its report and email it to the configured
recipients as an attachment, then emit `ScheduledReportSent`. A send failure SHALL retry with
backoff and, on exhaustion, raise an in-app alert.

#### Scenario: A weekly schedule emails recipients on time
- **WHEN** a `0 8 * * 1` schedule fires on Monday at 08:00
- **THEN** the configured recipients are emailed a summary with an attachment
- **AND** a `ScheduledReportSent` event is emitted

#### Scenario: A send failure retries and alerts
- **WHEN** a digest email send fails
- **THEN** it is retried with backoff, and on exhaustion an in-app alert is raised

### Requirement: Run a schedule on demand
`POST /api/v1/report-schedules/{id}/run-now` (perm `report.schedule.manage`) SHALL enqueue a
one-off render-and-send for the schedule and respond **202** with a `job_id`.

#### Scenario: Run-now triggers an immediate digest
- **WHEN** run-now is invoked for a schedule
- **THEN** the request is accepted with 202 and the digest is rendered and sent off the request path
