## ADDED Requirements

### Requirement: One active subscription per tenant with an explicit state machine
Each `CUSTOMER` tenant SHALL have at most one active `subscription` row (plan reference,
negotiated `annual_fee` as a money string, `term_start`, `term_end`, status
`ACTIVE | IN_GRACE | EXPIRED | CANCELLED`). Demo tenants (`DEMO_TEMPLATE` /
`DEMO_SANDBOX`) never carry subscriptions, and `DEPLOYMENT_MODE=self-hosted` mounts no
subscription surface at all. All state transitions MUST be written by exactly two
actors: the dunning sweep (time-driven) and the mark-paid / cancel endpoints
(admin-driven) — each recorded in `platform_audit_log`.

#### Scenario: Only one live subscription
- **WHEN** a platform admin attempts to create a second non-cancelled subscription for a tenant
- **THEN** the request is rejected with 409 STATE_CONFLICT

### Requirement: Payment extends the term from the previous term end
Marking a subscription invoice paid SHALL, in the same transaction, extend `term_end`
by the invoiced period measured from the **previous** `term_end` — a late payment does
not shorten the next term, and an early payment does not double-extend — and set the
subscription status to `ACTIVE`.

#### Scenario: Late renewal payment keeps the full year
- **WHEN** a subscription expired on 2027-03-31 and its renewal invoice is marked paid on 2027-04-10
- **THEN** the new `term_end` is 2028-03-31, not 2028-04-10

### Requirement: Expiry degrades in two stages and never locks anyone out
When `now > term_end`, the subscription SHALL become `IN_GRACE`: the tenant remains
fully operational (`tenant.status` stays `ACTIVE`) and users see a renewal banner. When
`now > term_end + BILLING_GRACE_DAYS` (default 15), the subscription becomes `EXPIRED`
and the tenant transitions to M8's `READ_ONLY` state — inheriting its canonical
definition verbatim: login works, every read works (explicitly including payroll runs,
payslips, reports, and PDF rendering), report exports and the PDPA data export work,
and business writes are rejected with 403 `TENANT_READ_ONLY`. **No automatic path SHALL
ever set a tenant `SUSPENDED`** — suspension over money is always a manual
platform-admin action.

#### Scenario: Grace period changes nothing but the banner
- **WHEN** a tenant's term ended 3 days ago with a 15-day grace period
- **THEN** users can still create and modify documents exactly as before
- **AND** the web app shows the grace countdown banner

#### Scenario: Expired factory still reads payroll and leaves with its data
- **WHEN** a tenant's grace period is exhausted and its HR manager logs in
- **THEN** login succeeds, payroll runs and payslips are readable, and the PDPA export can be triggered and downloaded
- **AND** submitting any business mutation returns 403 `TENANT_READ_ONLY`

#### Scenario: Payment restores service immediately
- **WHEN** an admin marks the renewal invoice of an `EXPIRED` tenant paid
- **THEN** in the same transaction the subscription is `ACTIVE`, the tenant leaves `READ_ONLY`, and the next user request writes normally
