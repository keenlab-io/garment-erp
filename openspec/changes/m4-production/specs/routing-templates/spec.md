## ADDED Requirements

### Requirement: Routing templates with ordered steps
The system SHALL manage routing templates via `POST /api/v1/routing-templates`
`{ name, product_type, steps:[{ seq, name, standard_time_min, department_id? }] }` (perm
`production.wo.manage`). Each `routing_step` MUST be unique on `(template_id, seq)` and carry
a `standard_time_min` used later for delay detection.

#### Scenario: Create a routing template with steps
- **WHEN** a user with `production.wo.manage` creates a template with an ordered list of steps
- **THEN** the `routing_template` and its `routing_step` rows are stored with their `seq` and `standard_time_min`

#### Scenario: Duplicate step sequence is rejected
- **WHEN** a template is created with two steps sharing the same `seq`
- **THEN** the request is rejected (unique `(template_id, seq)` violated)
