## ADDED Requirements

### Requirement: OT approval queue
The system SHALL provide an OT approval queue and detail gated by `hr.ot.approve`, letting an
approver approve or reject requests.

#### Scenario: Approve an OT request
- **WHEN** a user with `hr.ot.approve` approves a submitted OT request
- **THEN** its status advances and the queue updates

### Requirement: Mobile cash-advance approval with re-auth
Cash-advance approval SHALL render as a single thumb-reachable card (employee · amount · reason ·
ceiling-check badge) completable one-handed on mobile; Approve requires Super-Admin re-auth,
Reject captures a reason.

#### Scenario: Ceiling check is shown on the card
- **WHEN** a cash-advance approval card is opened
- **THEN** a badge shows whether the amount is within 50% (✓) or over the ceiling (⚠)

#### Scenario: Approval requires re-auth
- **WHEN** the approver taps Approve
- **THEN** a Super-Admin re-authentication is required before the advance is approved
