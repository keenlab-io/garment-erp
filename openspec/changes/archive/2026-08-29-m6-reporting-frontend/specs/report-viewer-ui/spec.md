## ADDED Requirements

### Requirement: Tabular report viewer with drill-down
The report viewer SHALL render a report's `{ columns, rows, totals }` as a Data Table with
drill-down from a dashboard data point, and totals that reconcile visibly with the underlying
rows.

#### Scenario: Drill down to report rows
- **WHEN** a dashboard data point is clicked
- **THEN** the report viewer opens on the underlying rows, with totals reconciling to those rows

### Requirement: Async report export
The viewer SHALL offer PDF/Excel/CSV export that runs as an asynchronous job — a job toast
appears and completion surfaces a notification with the downloadable file.

#### Scenario: Export runs asynchronously
- **WHEN** an export format is chosen
- **THEN** a job toast appears and the finished file is provided on completion
