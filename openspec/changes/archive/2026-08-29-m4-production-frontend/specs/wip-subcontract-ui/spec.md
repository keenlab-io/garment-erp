## ADDED Requirements

### Requirement: WIP bottleneck board
The system SHALL provide a by-department WIP board showing in-progress and delayed backlog so the
lead can spot bottlenecks.

#### Scenario: WIP board shows department backlog
- **WHEN** the WIP board is opened
- **THEN** each department's in-progress and delayed counts are shown as a backlog view

### Requirement: Subcontract SLA tracker
The subcontract tracker SHALL show an SLA countdown chip per outstanding subcontract that flips to
a danger chip and raises an alert when the SLA is overdue.

#### Scenario: Overdue subcontract raises a danger chip and alert
- **WHEN** a subcontract's SLA passes
- **THEN** its chip flips to danger and it surfaces in the alerts
