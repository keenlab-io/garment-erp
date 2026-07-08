## ADDED Requirements

### Requirement: Work order creation materializes a step snapshot
`POST /api/v1/work-orders` `{ customer_id?, finished_item_id, qty, due_date,
routing_template_id, machine?, mockup? }` (perm `production.wo.manage`) SHALL create a
`work_order` with an auto `wo_no` and **materialize** `work_order_step` rows by copying the
template's steps (`seq`, `standard_time_min`) as a snapshot. Later edits to the routing
template MUST NOT change an existing WO's materialized steps.

#### Scenario: Steps are materialized on creation
- **WHEN** a work order is created from a routing template
- **THEN** it receives a unique `wo_no` and one `work_order_step` per template step, copying `seq` and `standard_time_min`

#### Scenario: Template edits do not mutate live work orders
- **WHEN** a routing template is edited after a work order was created from it
- **THEN** that work order's materialized steps are unchanged

### Requirement: Work order lifecycle
A work order SHALL move through `PENDING → IN_PROGRESS → COMPLETED` with a `CANCELLED`
branch, and no backward transitions. It starts `PENDING`.

#### Scenario: New work order starts pending
- **WHEN** a work order is created
- **THEN** its status is `PENDING`

### Requirement: Work order detail and timeline feed
The system SHALL expose `GET /api/v1/work-orders/{id}` (returning the WO, its steps, and
defects) and `GET /api/v1/work-orders/timeline?from=&to=&status=` returning each WO with its
steps (`name, status, started_at, finished_at, is_delayed`) for the Gantt view, where
`is_delayed` is computed on read.

#### Scenario: Timeline returns steps with delay flags
- **WHEN** the timeline feed is requested for a date range
- **THEN** each work order is returned with its steps and a computed `is_delayed` per step
