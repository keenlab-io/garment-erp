## ADDED Requirements

### Requirement: Digest schedule management
The schedules screen SHALL manage report digests (perm `report.schedule.manage`) with a
cron-friendly cadence UI ("Every Monday 08:00"), recipients, and format, plus a Run-now
preview-send; send failures surface in the notification center with retry.

#### Scenario: Create a friendly schedule
- **WHEN** a user configures "Every Monday 08:00" with recipients and a format
- **THEN** the schedule is saved with the corresponding cron cadence

#### Scenario: Run now previews the digest
- **WHEN** Run-now is invoked for a schedule
- **THEN** the digest is sent immediately and any failure appears in the notification center with a retry
