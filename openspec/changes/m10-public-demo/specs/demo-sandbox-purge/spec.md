## ADDED Requirements

### Requirement: Explicit sign-out purges the sandbox
When a `DEMO_SANDBOX` guest signs out (the demo surface's "End demo & delete my data"
action calling `POST /auth/logout`, or any logout on a sandbox session), the system SHALL,
in the logout transaction: revoke the guest's sessions, set the tenant's
`status = PURGING`, and enqueue a `demo.purge` job (payload `{ tenantId }`, via m7's
`withTenantJob` conventions) using `publishAfterCommit` semantics so the job exists only
if the state change committed. A tenant in `PURGING` MUST refuse all further sign-ins and
API access (401/uniform envelope), including a re-arriving guest — they get a fresh
sandbox on their next sign-in instead.

#### Scenario: Sign-out triggers the purge
- **WHEN** a sandbox guest signs out explicitly
- **THEN** their sessions are revoked, the tenant status becomes `PURGING`, and exactly
  one `demo.purge` job for that tenant is enqueued after commit

#### Scenario: PURGING tenant is inaccessible
- **WHEN** any request carries a token whose `tid` names a tenant with status `PURGING`
- **THEN** the request is rejected and no data is readable or writable

#### Scenario: Guest returns after purging began
- **WHEN** the guest signs in on the demo host while their old sandbox is `PURGING` or
  already gone
- **THEN** provisioning creates a fresh sandbox rather than resuming the old one

### Requirement: Idle and session-expiry backstop sweep
Because most guests close the tab rather than sign out — logout alone would leak
sandboxes (and guest PII) forever (design D4) — a repeatable `demo.idle-sweep` job
(worker role, registered like the existing sales-overdue/production-monitor sweeps, every
`DEMO_SWEEP_INTERVAL_MS`) SHALL iterate `DEMO_SANDBOX` tenants and, for each whose last
session activity is older than `DEMO_SANDBOX_IDLE_MINUTES` **or** whose sessions are all
expired/revoked, set `status = PURGING` and enqueue `demo.purge`. The sweep SHALL also
re-enqueue `demo.purge` for any tenant already `PURGING` with no live purge job (a
crashed or lost purge), making the sweep the guarantee that no sandbox outlives its
window. The sweep runs only in cloud mode.

#### Scenario: Closed tab still gets purged
- **WHEN** a guest closes the tab without signing out and `DEMO_SANDBOX_IDLE_MINUTES`
  elapse with no session activity
- **THEN** the next sweep marks the sandbox `PURGING` and enqueues `demo.purge`

#### Scenario: Active guest is not cut off
- **WHEN** a sandbox has a live session with activity newer than the idle window
- **THEN** the sweep leaves it untouched

#### Scenario: Stuck purge is retried
- **WHEN** a tenant has been `PURGING` since before the previous sweep and no `demo.purge`
  job for it is queued or running
- **THEN** the sweep enqueues a new `demo.purge` for that tenant

### Requirement: Purge ordering is complete and safety-checked
`DemoPurgeService` (`apps/api/src/demo/`, drained by a worker on the `default` queue)
SHALL execute the purge for `{ tenantId }` in this order: (1) re-read the tenant inside
the purge context and **hard-assert `kind = DEMO_SANDBOX`**, refusing to delete anything
otherwise — this assertion is the last line between a bug and a paying customer's data;
(2) revoke any remaining sessions; (3) delete the tenant's rows across all business
tables in **reverse-FK dependency order** (children before parents — e.g.
`production_scan` → `work_order_step` → `work_order`; `payment` → `invoice`; line tables
before their documents), running under the tenant's RLS context so deletes cannot touch
another tenant; (4) delete every object under the `tenants/{tid}/` S3 prefix via
`StorageService`; (5) delete the tenant's `auth_identity` rows; (6) delete the guest
`user` rows; (7) delete the `tenant` row; (8) write a `platform_audit_log` row recording
the purge (tenant id, trigger, row/object counts — **never** the guest email on the
default path). The reverse-FK order SHALL be derived from or verified against the schema
(a static test walks `@erp/db` FK metadata) so new M11+ tables cannot silently break the
purge.

#### Scenario: Purge removes everything
- **WHEN** `demo.purge` completes for a sandbox
- **THEN** no row in any business table carries that `tenant_id`, no S3 object remains
  under `tenants/{tid}/`, and the `auth_identity`, guest `user`, and `tenant` rows are
  gone
- **AND** a `platform_audit_log` row records the purge

#### Scenario: Purge refuses a non-sandbox tenant
- **WHEN** a `demo.purge` job names a tenant whose `kind` is not `DEMO_SANDBOX`
- **THEN** the worker deletes nothing, fails the job as non-retryable, and writes a
  `platform_audit_log` row flagging the refusal

#### Scenario: FK order stays correct as the schema grows
- **WHEN** a later change adds a tenant-scoped table without registering it in the purge
  order
- **THEN** the static purge-order test fails the build

### Requirement: Purge is idempotent and retryable
`demo.purge` SHALL run with the queue's standard retry policy (`DEFAULT_JOB_OPTIONS`:
5 attempts, exponential backoff) and a deduplicating job id (`demo.purge:{tenantId}`) so
concurrent triggers (logout racing the sweep) collapse to one job. Every step MUST be
idempotent: deletes of already-deleted rows/objects are no-ops, and a retry after a
partial failure resumes from wherever the previous attempt stopped. A job for a tenant
that no longer exists SHALL complete successfully as a no-op. Exhausted retries leave the
tenant in `PURGING` (never half-visible as `ACTIVE`) for the sweep to re-enqueue and for
dead-letter inspection.

#### Scenario: Retry after partial failure completes the purge
- **WHEN** a purge attempt fails after deleting the rows but before the S3 prefix
- **THEN** the retried job re-runs, skips the already-empty tables, deletes the prefix,
  and finishes the remaining steps

#### Scenario: Duplicate triggers collapse
- **WHEN** logout and the idle sweep both enqueue a purge for the same tenant
- **THEN** the deduplicated job id yields a single execution (or a second run that
  no-ops), never a conflicting pair

#### Scenario: Already-purged tenant is a no-op
- **WHEN** `demo.purge` runs for a tenant id with no remaining tenant row
- **THEN** the job completes successfully without error

### Requirement: Guest PII is purged by default; lead capture only on explicit opt-in
The guest's Gmail address and display name are personal data (PDPA). By default the purge
SHALL destroy them with the sandbox — they exist nowhere outside the deleted `user` and
`auth_identity` rows, and purge audit rows MUST NOT contain them. Only when the guest
checked the opt-in checkbox at signup (`demo-sandbox-provisioning`) SHALL the purge first
copy `{ email, name, consented_at }` into a platform-side `demo_lead` record (control
plane, `TENANT_EXEMPT`) and record the capture in `platform_audit_log`. Silent retention
in any form — logs, analytics, audit payloads — is prohibited (design D6).

#### Scenario: No opt-in, no trace
- **WHEN** a sandbox whose guest never opted in is purged
- **THEN** the Gmail address survives in no table, no S3 object, and no audit payload

#### Scenario: Opt-in captures the lead before deletion
- **WHEN** a sandbox whose guest checked the consent box is purged
- **THEN** exactly one `demo_lead` row with `{ email, name, consented_at }` is written
  before the identity/user rows are deleted
- **AND** the capture is recorded in `platform_audit_log`
