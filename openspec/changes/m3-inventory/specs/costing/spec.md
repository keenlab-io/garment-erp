## ADDED Requirements

### Requirement: Moving-average costing (default)
For items using `MAV`, an IN posting SHALL recompute `avg_cost = (qty_on_hand·avg_cost +
in_qty·in_unit_cost) / (qty_on_hand + in_qty)`, and an OUT posting SHALL use the current
`avg_cost`. All arithmetic MUST use decimal (no float) with half-up rounding.

#### Scenario: Weighted average after two receipts
- **WHEN** 10 units are received at ฿100 then 10 units at ฿120 for a MAV item
- **THEN** `avg_cost` becomes ฿110

#### Scenario: Issue posts at current average
- **WHEN** 5 units are issued from that item
- **THEN** the OUT movement's `unit_cost` is ฿110

### Requirement: FIFO costing
For items using `FIFO`, an OUT SHALL consume `stock_lot` rows oldest-first (by `received_at`,
tie-broken by `id`), decrementing each lot's `qty_remaining`. An issue that spans multiple
lots MUST post one movement per consumed lot at that lot's `unit_cost`.

#### Scenario: Issue spanning two lots splits into two movements
- **WHEN** a FIFO issue quantity exceeds the oldest lot's remaining quantity
- **THEN** the oldest lot is fully consumed at its cost and the remainder is drawn from the next lot at its cost, as two separate OUT movements

### Requirement: Standard costing with variance
For items using `STANDARD`, an OUT SHALL post at `item.standard_cost`, and the difference
between standard and actual cost SHALL be recorded for variance reporting.

#### Scenario: Issue posts at standard cost
- **WHEN** a STANDARD-costed item is issued
- **THEN** the OUT movement's `unit_cost` is the item's `standard_cost`
- **AND** the actual-vs-standard difference is available to variance reporting
