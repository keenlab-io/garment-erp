## ADDED Requirements

### Requirement: Goods receipt wizard with landed-cost preview
The goods-receipt wizard SHALL add lines (scan or search, echoing item name + running line total
+ dual-UOM display), then a landed-cost step where a freight/import total and an allocation
method (value/weight/qty) produce a **live per-line cost-impact preview** before confirm and post.

#### Scenario: Landed cost previews per-line impact before posting
- **WHEN** a freight total and allocation method are entered on the landed-cost step
- **THEN** each line's allocated unit cost updates in a live preview before the user confirms

#### Scenario: Posting creates lots and ledger IN
- **WHEN** the receipt is posted
- **THEN** lots are created, a ledger IN is recorded, and a lot-barcode label job is enqueued

### Requirement: UOM conversion is shown, not hidden
Receiving in a non-base UOM SHALL display both units (e.g. "1 roll = 50 m") rather than silently
converting.

#### Scenario: Dual UOM display
- **WHEN** a line is received in a non-base UOM
- **THEN** both the receiving UOM and base-UOM equivalent are shown
