## ADDED Requirements

### Requirement: Bill of materials
The system SHALL manage BOMs via `POST /api/v1/boms` `{ finished_item_id, lines[],
conversion_cost? }`, where each `bom_line` references a raw item with a quantity, UOM, and
`scrap_pct`. A BOM is versioned per finished item (`unique(finished_item_id, version)`) and
may be active or inactive.

#### Scenario: Create a BOM with component lines
- **WHEN** a BOM is created for a finished item with raw-material lines
- **THEN** the BOM and its `bom_line` rows are stored with their `scrap_pct` and optional `conversion_cost`

### Requirement: Read-only cost roll-up
`POST /api/v1/boms/{id}/rollup` SHALL compute the rolled-up cost as a recursive walk of
`bom_line` × current component cost × `(1 + scrap_pct)`, summed bottom-up, plus
`conversion_cost`. The roll-up MUST be a pure read — it writes no ledger rows.

#### Scenario: Roll-up sums component costs with scrap
- **WHEN** a roll-up is requested for a BOM
- **THEN** the response returns the rolled-up cost and a per-component breakdown
- **AND** no `stock_movement` rows are written

#### Scenario: Roll-up recurses into sub-assemblies
- **WHEN** a BOM line references an item that itself has an active BOM
- **THEN** that component's cost is itself rolled up and included bottom-up
