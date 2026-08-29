## ADDED Requirements

### Requirement: Stock count and reconciliation
The system SHALL manage stock counts through `OPEN → COUNTING → RECONCILED → ADJUSTED →
CLOSED`. `POST /api/v1/stock-counts` `{ period, item_ids[] }` opens a count and snapshots
`system_qty` per item; `PUT /{id}/lines` records `counted_qty`; `/{id}/reconcile` creates a
**draft stock adjustment** for the differences.

#### Scenario: Open snapshots system quantities
- **WHEN** a stock count is opened for a set of items
- **THEN** each `stock_count_line` records the current `system_qty`

#### Scenario: Reconcile drafts an adjustment for the differences
- **WHEN** a count with recorded `counted_qty` values is reconciled
- **THEN** a draft `stock_adjustment` is created whose lines are the counted-vs-system differences

### Requirement: Reason-gated stock adjustment
The system SHALL manage adjustments through `DRAFT → APPROVED → POSTED`.
`POST /api/v1/stock-adjustments` `{ reason, lines[] }` MUST reject a missing/blank `reason`
with 400 before any state change; `/{id}/approve` (perm `inventory.adjustment.approve`) and
`/{id}/post` transition the adjustment, and POST writes ledger `ADJUST` movements. A posted
adjustment MUST write exactly one `audit_log` row capturing actor, reason, and before/after.

#### Scenario: Adjustment without a reason is rejected
- **WHEN** a stock adjustment is submitted without a non-blank `reason`
- **THEN** the request is rejected with 400 and no state changes

#### Scenario: Posting writes ADJUST movements and one audit row
- **WHEN** an approved adjustment with a reason is posted
- **THEN** each line writes a ledger `ADJUST` movement
- **AND** exactly one `audit_log` row is written capturing the actor, the reason, and before/after
- **AND** a `StockAdjusted` event is emitted
