## ADDED Requirements

### Requirement: OT request lifecycle
The system SHALL manage OT requests through the states
`DRAFT → SUBMITTED → APPROVED → RECONCILED → PAID` with a `REJECTED` branch from
`SUBMITTED`. `POST /api/v1/ot-requests` creates a DRAFT; `/{id}/submit` → SUBMITTED;
`/{id}/approve` (perm `hr.ot.approve`) → APPROVED; `/{id}/reconcile` → RECONCILED. Illegal
transitions MUST be rejected with 409 STATE_CONFLICT.

#### Scenario: Approve a submitted request
- **WHEN** a user with `hr.ot.approve` approves a SUBMITTED OT request
- **THEN** the request transitions to APPROVED and records the approver

#### Scenario: Illegal transition is rejected
- **WHEN** an OT request in DRAFT is approved directly
- **THEN** the request is rejected with 409 STATE_CONFLICT

### Requirement: Reconciliation uses min(requested, attended)
On reconcile the system SHALL set `approved_hours` to the minimum of the requested hours and
the attended hours from `attendance` for the request's `work_date`, unless an explicit
`approved_hours` override is supplied.

#### Scenario: Attended hours cap the approved hours
- **WHEN** an OT request for 3 hours is reconciled and attendance shows 2 hours worked
- **THEN** `approved_hours` is set to 2

#### Scenario: Explicit override is honored
- **WHEN** reconcile is called with an explicit `approved_hours`
- **THEN** that value is used instead of the computed minimum

### Requirement: OT pay computation
OT pay SHALL be computed as `approved_hours × hourly_rate × rate_multiplier`, where the
hourly rate derives from the employee's current base salary and the multiplier is resolved
from the current-effective OT-rate configuration for the request's `rate_type`.

#### Scenario: OT pay reflects reconciled hours
- **WHEN** an OT request reconciled to 2 hours is included in payroll
- **THEN** its OT pay equals `2 × hourly_rate × rate_multiplier`
