## ADDED Requirements

### Requirement: Stock count and reconcile
The system SHALL provide a count session grid and a reconcile step that drafts an adjustment for
differences; items in an open count show a "locked for counting" badge that disables movement,
with an explanation.

#### Scenario: Reconcile drafts an adjustment
- **WHEN** a count is reconciled
- **THEN** an adjustment is drafted for the counted differences

#### Scenario: Counting locks movement
- **WHEN** an item is part of an open count
- **THEN** it shows a "locked for counting" badge and movement is disabled with an explanation

### Requirement: Reason-gated adjustment
Creating a stock adjustment SHALL require a reason (submit blocked with a field error otherwise);
approval uses the guarded confirm dialog, gated by `inventory.adjustment.approve`.

#### Scenario: Adjustment without a reason is blocked
- **WHEN** an adjustment is submitted without a reason
- **THEN** submission is blocked with a reason-field error

#### Scenario: Approving an adjustment is guarded
- **WHEN** a user with `inventory.adjustment.approve` approves an adjustment
- **THEN** a confirm dialog states the consequence before it posts to the ledger
