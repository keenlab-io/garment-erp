## ADDED Requirements

### Requirement: Counted-seat definition with the scan-only exemption
A user SHALL occupy a seat iff `deleted_at IS NULL`, status is `PENDING` or `ACTIVE`,
and the user's effective permission set (the M1 role→permission union; tenant
super-admin counts as everything) is NOT a subset of `SCAN_ONLY_PERMISSIONS =
["production.scan"]`, a named constant exported from
`packages/contracts/src/permissions/catalog.ts`. Users whose entire effective set is
shop-floor scanning (or empty) are exempt and MUST be creatable in unlimited numbers —
free floor accounts are a deliberate commercial decision from the GTM document, not a
loophole. The seat cap is `plan.included_seats + tenant.extra_seats`.

#### Scenario: Scan-only floor accounts are free
- **WHEN** a Workshop tenant (8 seats) already has 8 counted users and creates a 20th user whose only role grants `production.scan`
- **THEN** the creation succeeds
- **AND** the tenant's counted-seat total remains 8

#### Scenario: Disabling a user frees the seat
- **WHEN** a counted user is set to `DISABLED`
- **THEN** the counted-seat total decreases by one and a replacement counted user can be created

### Requirement: Hard 422 on over-cap user creation
`POST /users` for a user who would occupy a seat SHALL be rejected with 422
(`BusinessRuleError`, error code `BUSINESS_RULE`) when the counted-seat total already
equals the cap. The error `details[]` MUST carry the cap, the current counted total, and
the exempt (scanner) total so the admin sees why. The check MUST run inside the same
transaction as the insert, serialized per tenant (`FOR UPDATE` on the tenant row), so
concurrent creations cannot both pass under the cap.

#### Scenario: The ninth counted Workshop user is refused
- **WHEN** a Workshop tenant with 8 counted users creates another user with an office role
- **THEN** the request fails with 422 and details naming cap 8 and counted 8
- **AND** no user row is created

#### Scenario: Concurrent creations cannot exceed the cap
- **WHEN** two admins concurrently create counted users with exactly one seat remaining
- **THEN** exactly one creation succeeds and the other fails with 422

### Requirement: Every seat-promoting mutation enforces the cap
The cap check SHALL also guard every operation that can turn an exempt user into a
counted one: `PUT /users/{id}/roles`, role edits (`PUT /roles/{id}`), the Excel
permission import, and reactivation (`DISABLED → ACTIVE`). For role edits and imports
the check runs against the projected post-change counted total; on failure the 422's
`details[]` MUST name the users who would become counted, and nothing is written
(all-or-nothing, matching the M1 import semantics).

#### Scenario: A role edit that would promote scanners is refused with names
- **WHEN** an admin adds `hr.payslip.view` to a role held by 5 scan-only users in a tenant with 2 free seats
- **THEN** the edit fails with 422 and the details list the 5 users who would become counted
- **AND** the role's permission set is unchanged and no `permissions_version` bump occurs
