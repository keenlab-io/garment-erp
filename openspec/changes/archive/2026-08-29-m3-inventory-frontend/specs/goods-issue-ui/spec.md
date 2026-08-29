## ADDED Requirements

### Requirement: Scan-first goods issue in Touch density
The goods-issue screen SHALL run in Touch density on handhelds with a persistent scan field loop
(scan item/lot → qty → repeat), listing the last five scans with undo and minimal chrome, gated
by `inventory.issue.manage`.

#### Scenario: Issue materials by scanning
- **WHEN** an operator scans items/lots and enters quantities on a handheld
- **THEN** each scan is echoed in the last-five list with undo, and posting writes a ledger OUT

### Requirement: Insufficient stock is explained inline
When an issue exceeds available stock, the system SHALL show the backend 422 inline with the
exact remaining quantity, not a generic failure.

#### Scenario: Over-issue shows remaining quantity
- **WHEN** a posted issue exceeds available stock
- **THEN** an inline message states the exact remaining quantity (e.g. "only 12 m left")
