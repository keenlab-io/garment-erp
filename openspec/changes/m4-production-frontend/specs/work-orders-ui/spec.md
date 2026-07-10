## ADDED Requirements

### Requirement: Work order list and detail
The system SHALL provide a work-order list and a detail view with steps, mockup viewer, defect
log, and step history, gated by `production.wo.manage`.

#### Scenario: Open a work order
- **WHEN** a work order is opened
- **THEN** its steps, mockup, defects, and step history are shown

### Requirement: Create work order from routing
The system SHALL provide a create-from-routing wizard that produces a work order with its
materialized steps.

#### Scenario: Create a work order
- **WHEN** a lead creates a work order from a routing template
- **THEN** the work order is created with its steps and appears on the timeline
