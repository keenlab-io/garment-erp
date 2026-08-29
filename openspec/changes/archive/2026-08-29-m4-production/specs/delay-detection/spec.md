## ADDED Requirements

### Requirement: Running-step delay detection
A step SHALL be considered delayed when its elapsed time — from `started_at` to `finished_at`,
or to now if still running — exceeds its `standard_time_min`. Delay MUST be computed in the
service/view (not the placeholder generated column). A periodic monitor SHALL detect
`IN_PROGRESS` steps that have newly exceeded their standard time and emit `StepDelayed` once
for each, pushing the alert to the work order's realtime rooms.

#### Scenario: Exceeding standard time flags a running step
- **WHEN** an IN_PROGRESS step's elapsed time passes its `standard_time_min`
- **THEN** the monitor emits `StepDelayed` for that step and pushes it to the `wo:{id}` and `timeline` rooms
- **AND** the step is flagged delayed in the timeline feed

#### Scenario: A step is not alerted twice
- **WHEN** a step already flagged delayed is seen again by the monitor
- **THEN** no additional `StepDelayed` event is emitted for it

#### Scenario: On-time step is not flagged
- **WHEN** a step finishes within its `standard_time_min`
- **THEN** it is not marked delayed
