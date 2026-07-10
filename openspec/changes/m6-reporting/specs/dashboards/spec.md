## ADDED Requirements

### Requirement: Cross-filtered dashboards
`GET /api/v1/dashboards/{key}` SHALL return `{ panels: [{ key, data }] }`, applying a single
`(dimension, value)` filter set consistently across **every** panel so all panels reflect the
same window.

#### Scenario: One filter applies across all panels
- **WHEN** a dashboard is requested with `?dimension=month&value=2026-03`
- **THEN** every panel (e.g. Top-Products and Sales-by-Customer) is filtered to that same month

#### Scenario: Selecting a window re-filters sibling panels
- **WHEN** the sales panel is filtered to "this month"
- **THEN** the Top-Products and Sales-by-Customer panels re-filter to the same window
