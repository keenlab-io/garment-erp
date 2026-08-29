## ADDED Requirements

### Requirement: Filterable, immutable audit log
The audit log SHALL render as a filterable table (actor, entity type, action, date range) on a
visibly read-only (sunken) surface with **no row actions**, communicating immutability. Each row
expands to a two-column before/after diff with changed fields highlighted.

#### Scenario: Audit rows are non-interactive and scannable
- **WHEN** the audit log is viewed
- **THEN** rows have no edit actions and are visibly read-only, and expanding a row shows a before/after diff with changed fields highlighted

#### Scenario: Audit log filters
- **WHEN** the viewer filters by actor, action, or date range
- **THEN** only matching audit entries are shown
