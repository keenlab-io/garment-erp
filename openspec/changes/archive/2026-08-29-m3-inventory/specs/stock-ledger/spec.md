## ADDED Requirements

### Requirement: Append-only stock movement ledger
`stock_movement` SHALL be an append-only ledger: every stock change is an immutable row
(`qty` signed, `direction` `IN | OUT | ADJUST`, `unit_cost`, `ref_type`, `ref_id`). Any
UPDATE or DELETE against `stock_movement` MUST be rejected by the database itself (a trigger),
so immutability holds regardless of application code. Corrections MUST be new compensating
movements, never edits.

#### Scenario: UPDATE on a movement is rejected
- **WHEN** any database session attempts to UPDATE a `stock_movement` row
- **THEN** the database raises an error and the row is unchanged

#### Scenario: DELETE on a movement is rejected
- **WHEN** any database session attempts to DELETE a `stock_movement` row
- **THEN** the database raises an error and the row remains

#### Scenario: Correction is a compensating movement
- **WHEN** a posted movement must be reversed
- **THEN** a new movement with the opposite signed quantity is appended rather than editing the original

### Requirement: Quantities converted to base UOM before posting
All quantities SHALL be converted to the item's `base_uom` via `uom_conversion` before any
`stock_movement`, `stock_lot`, or `stock_balance` write.

#### Scenario: A line in a non-base UOM is converted
- **WHEN** a receipt or issue line specifies a UOM other than the item's base UOM
- **THEN** the quantity is converted to base UOM using the registered factor before the ledger row is written

### Requirement: Derived, reconstructable stock balance
`stock_balance (item_id, warehouse_id)` SHALL be a derived cache (`qty_on_hand`, `avg_cost`)
updated in the **same transaction** as every ledger insert. Replaying all `stock_movement`
rows for an item/warehouse MUST reproduce its `stock_balance` exactly.

#### Scenario: Balance updates atomically with the ledger
- **WHEN** a movement is posted
- **THEN** `stock_balance` for that `(item, warehouse)` is updated in the same transaction as the movement insert

#### Scenario: Replay reproduces the balance
- **WHEN** all `stock_movement` rows for an item/warehouse are replayed from zero
- **THEN** the resulting `qty_on_hand` and `avg_cost` equal the stored `stock_balance`
