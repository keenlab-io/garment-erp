## ADDED Requirements

### Requirement: Append-only production scans drive step status
`POST /api/v1/wo-steps/{id}/scan` `{ action: 'START' | 'FINISH' }` (perm `production.scan`)
SHALL append an immutable `production_scan` fact and update the step. `START` sets the step's
`started_at` and status IN_PROGRESS (and the WO to IN_PROGRESS if it is the first step to
start); `FINISH` sets `finished_at` and status COMPLETED. `production_scan` MUST be
append-only (UPDATE/DELETE rejected). Step timestamps derive from the earliest START / latest
FINISH.

#### Scenario: Scan START starts the step and work order
- **WHEN** the first step of a PENDING work order is scanned START
- **THEN** the step becomes IN_PROGRESS with `started_at` set
- **AND** the work order becomes IN_PROGRESS
- **AND** a `StepStarted` event is emitted and pushed to the work order's realtime rooms

#### Scenario: Scan FINISH completes the step
- **WHEN** an IN_PROGRESS step is scanned FINISH
- **THEN** the step becomes COMPLETED with `finished_at` set
- **AND** a `StepFinished` event is emitted and pushed to the realtime rooms

#### Scenario: Re-finishing a completed step conflicts
- **WHEN** a COMPLETED step is scanned FINISH again
- **THEN** the request is rejected with 409 STATE_CONFLICT

#### Scenario: Scans are append-only
- **WHEN** any database session attempts to UPDATE or DELETE a `production_scan` row
- **THEN** the database rejects it

### Requirement: Step hold and defects
The system SHALL support `POST /api/v1/wo-steps/{id}/hold` `{ reason }` (step → HOLD) and
`POST /api/v1/wo-steps/{id}/defects` `{ type, qty, note }` recording a `defect` against the
step.

#### Scenario: Hold a step with a reason
- **WHEN** a step is put on hold with a reason
- **THEN** the step status becomes HOLD

#### Scenario: Record a defect on a step
- **WHEN** a defect is recorded for a step
- **THEN** a `defect` row is stored with its type, quantity, and note
- **AND** a `DefectRecorded` event is emitted
