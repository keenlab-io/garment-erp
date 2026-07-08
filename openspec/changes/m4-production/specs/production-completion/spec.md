## ADDED Requirements

### Requirement: Completing the last step completes the work order
When the **last** step of a work order becomes COMPLETED, the system SHALL transition the
work order to COMPLETED and emit `WorkOrderCompleted { wo_id, finished_item_id, qty }`
carrying the unit-of-work `correlation_id`. The event is the trigger for M3 backflush.

#### Scenario: Final step completion completes the WO and emits the event
- **WHEN** the final step of a work order is scanned FINISH
- **THEN** the work order becomes COMPLETED
- **AND** exactly one `WorkOrderCompleted { wo_id, finished_item_id, qty }` event is emitted with the work order's `correlation_id`

#### Scenario: Non-final completion does not complete the WO
- **WHEN** a non-final step is completed while other steps remain
- **THEN** the work order stays IN_PROGRESS and no `WorkOrderCompleted` is emitted

### Requirement: Completion emission is safe for idempotent backflush
`WorkOrderCompleted` SHALL be dispatched after the work-order completion commits, so that a
downstream backflush failure does not roll back the completion. The consumer (M3) is
idempotent on `wo_id`, so a redelivered event does not double-post.

#### Scenario: Backflush failure does not revert completion
- **WHEN** the work order has committed as COMPLETED and a downstream backflush consumer fails
- **THEN** the work order remains COMPLETED and the event may be retried

#### Scenario: Duplicate completion does not double-trigger
- **WHEN** `WorkOrderCompleted` for the same `wo_id` is delivered more than once
- **THEN** the idempotent backflush consumer posts only once
