## ADDED Requirements

### Requirement: Backflush on work-order completion
The system SHALL consume `WorkOrderCompleted { wo_id, finished_item_id, qty }` (emitted by M4)
and, in **one transaction**, post a finished-goods `IN` movement (qty produced, valued at the
rolled-up BOM cost) and a raw-material `OUT` movement for each active BOM line ×
`produced_qty × (1 + scrap_pct)` at current cost, then emit `BackflushPosted`. A partial
failure MUST roll the entire backflush back.

#### Scenario: Backflush posts FG IN and RM OUT atomically
- **WHEN** a work order completes producing 100 finished units
- **THEN** a finished-goods `IN` of 100 at rolled-up cost and one raw-material `OUT` of `bom_qty × 100 × (1 + scrap_pct)` per active BOM line are posted in the same transaction

#### Scenario: A failure rolls back the whole backflush
- **WHEN** any part of the backflush fails
- **THEN** neither the FG IN nor any RM OUT is persisted

### Requirement: Backflush is idempotent on work order
Backflush SHALL be idempotent on `wo_id`: if a `BACKFLUSH` movement already references the
`wo_id`, a repeated `WorkOrderCompleted` MUST NOT post again.

#### Scenario: Duplicate completion does not double-post
- **WHEN** `WorkOrderCompleted` is delivered twice for the same `wo_id`
- **THEN** the backflush posts exactly once and the second delivery is a no-op
