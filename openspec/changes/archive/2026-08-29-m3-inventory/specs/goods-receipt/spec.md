## ADDED Requirements

### Requirement: Goods receipt lifecycle
The system SHALL manage goods receipts through `DRAFT → CONFIRMED → POSTED`.
`POST /api/v1/goods-receipts` `{ supplier_id, lines[], landed_cost_total?, alloc_method? }`
(perm `inventory.receipt.manage`) creates a DRAFT; `/{id}/confirm` allocates landed cost;
`/{id}/post` writes ledger IN movements and creates `stock_lot` rows. Posting an
already-posted receipt MUST return 409.

#### Scenario: Post creates lots and IN movements
- **WHEN** a CONFIRMED receipt is posted
- **THEN** each line creates a `stock_lot` and a ledger `IN` movement in base UOM
- **AND** a `GoodsReceiptPosted` event is emitted

#### Scenario: Re-posting conflicts
- **WHEN** an already-POSTED receipt is posted again
- **THEN** the request is rejected with 409 STATE_CONFLICT

### Requirement: Landed-cost allocation at confirm
On confirm the system SHALL allocate `landed_cost_total` across lines by `alloc_method`
(`VALUE | WEIGHT | QTY`), persisting each line's `allocated_landed` and setting the effective
`unit_cost = unit_price + allocated_landed / qty`. The allocation MUST sum to
`landed_cost_total` (rounding remainder assigned so the parts total exactly).

#### Scenario: Landed cost raises each line's unit cost
- **WHEN** a receipt with a non-zero `landed_cost_total` is confirmed
- **THEN** each line's effective `unit_cost` equals its `unit_price` plus its allocated landed cost per unit
- **AND** the sum of allocated landed cost across lines equals `landed_cost_total`

#### Scenario: Lots are created at the landed unit cost
- **WHEN** the confirmed receipt is posted
- **THEN** each created `stock_lot.unit_cost` reflects the landed unit cost
