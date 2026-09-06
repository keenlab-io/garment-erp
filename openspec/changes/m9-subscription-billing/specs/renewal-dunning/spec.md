## ADDED Requirements

### Requirement: Renewal invoices are issued ahead of term end
A control-plane sweep (`billing.dunning`, repeatable BullMQ job, interval
`BILLING_SWEEP_MS`) SHALL auto-issue the renewal invoice for each `ACTIVE` subscription
at `term_end − BILLING_RENEWAL_LEAD_DAYS` (default 45), with standard lines (annual
fee, extra seats, optional up-front discount; never a setup fee). Exactly one renewal
invoice per term MUST be issued regardless of sweep restarts or overlapping runs, and
`CANCELLED` subscriptions are skipped.

#### Scenario: One renewal invoice per term
- **WHEN** the sweep runs repeatedly across the lead window, including after a worker restart
- **THEN** exactly one renewal invoice exists for that subscription's upcoming term

### Requirement: Reminders follow a declining schedule across every stage
The sweep SHALL record and send reminder touches to the tenant's billing contact at
T−30, T−14, T−7, and T0 relative to `term_end`, weekly while `IN_GRACE`, and once on
entry to `READ_ONLY` — each touch persisted (in the subscription's `dunning_events`) so
no touchpoint ever fires twice, and each surfaced in-app via the grace/renewal banner
state. Reminder content states the amount due, the payment instructions, and — during
grace — the date service degrades.

#### Scenario: Touches are idempotent
- **WHEN** the sweep processes a subscription whose T−14 touch is already recorded
- **THEN** no duplicate reminder is sent

#### Scenario: Grace reminders name the consequence and its date
- **WHEN** a subscription is `IN_GRACE`
- **THEN** each weekly reminder states the exact date the tenant becomes read-only
- **AND** states that reading data and exporting will continue to work after that date

### Requirement: The sweep is the only clock
Time-driven subscription transitions (`ACTIVE → IN_GRACE → EXPIRED`, and the resulting
tenant `READ_ONLY` entry) SHALL happen only in the dunning sweep — never inline in a
request path — so behavior is testable by advancing the clock and a down worker fails
soft in the customer's favor (late degradation, never early).

#### Scenario: A down worker never punishes the customer
- **WHEN** the sweep is offline as a term end passes and resumes two days later
- **THEN** the tenant experienced no interruption in the interim and transitions are applied, correctly staged, on the next run
