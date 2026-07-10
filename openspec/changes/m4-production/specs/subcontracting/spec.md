## ADDED Requirements

### Requirement: Send a step to a subcontractor
`POST /api/v1/wo-steps/{id}/subcontract` `{ vendor, sla_due }` (perm
`production.subcontract.manage`) SHALL set the step to OUTSOURCED and create a `subcontract`
with status `SENT` and the given `sla_due`.

#### Scenario: Sending outsources the step
- **WHEN** a step is subcontracted to a vendor with an SLA due date
- **THEN** the step becomes OUTSOURCED and a `subcontract` row is created with status `SENT`

### Requirement: Overdue subcontracts are flipped by the monitor
The periodic monitor SHALL flip a `SENT` subcontract to `OVERDUE` once `sla_due` has passed,
emitting `SubcontractOverdue`.

#### Scenario: Past-SLA subcontract becomes overdue
- **WHEN** the monitor runs and a `SENT` subcontract's `sla_due` is in the past
- **THEN** the subcontract becomes `OVERDUE` and a `SubcontractOverdue` event is emitted

### Requirement: Receiving returns the step to the line
`POST /api/v1/subcontracts/{id}/receive` SHALL set the subcontract to `RECEIVED` and return
the step to the production line so work can continue.

#### Scenario: Receive resumes the step
- **WHEN** an outsourced step's subcontract is received
- **THEN** the subcontract becomes `RECEIVED` and the step re-enters the line for continuation
