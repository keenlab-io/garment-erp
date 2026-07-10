## ADDED Requirements

### Requirement: Goods issue lifecycle
The system SHALL manage goods issues through `DRAFT → POSTED`. `POST /api/v1/goods-issues`
`{ purpose, ref_wo_id?, lines[] }` (perm `inventory.issue.manage`) creates a DRAFT;
`/{id}/post` writes ledger OUT movements (in base UOM, valued per the item's costing method)
and emits `GoodsIssued`.

#### Scenario: Post writes OUT movements
- **WHEN** a DRAFT issue is posted
- **THEN** each line writes a ledger `OUT` movement in base UOM valued per the item's costing method
- **AND** a `GoodsIssued` event is emitted

### Requirement: Negative-stock enforcement
When negative stock is disallowed by configuration, issuing more than the item's
`qty_on_hand` MUST be rejected with 422 BUSINESS_RULE before any ledger write. When allowed,
the OUT posts and on-hand may go negative.

#### Scenario: Over-issue is rejected when negative stock is disallowed
- **WHEN** an issue would drive `qty_on_hand` below zero and negative stock is disallowed
- **THEN** the request is rejected with 422 BUSINESS_RULE and no movement is written

#### Scenario: Over-issue is allowed when configured
- **WHEN** the same issue is attempted and negative stock is allowed by configuration
- **THEN** the OUT movement posts and `qty_on_hand` may become negative
