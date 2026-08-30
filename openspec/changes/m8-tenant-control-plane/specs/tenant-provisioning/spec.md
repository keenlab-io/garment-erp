## ADDED Requirements

### Requirement: One provisioning engine creates a working tenant atomically
The system SHALL provide `ProvisioningService.provisionTenant` in
`apps/api/src/platform/` which, in a single `UnitOfWork.withTransaction`, creates the
`tenant` row (kind `CUSTOMER`, status `ACTIVE`, the chosen `plan_id`), its
`tenant_domain` row (`resolution_mode = TENANT`), the per-tenant configuration rows that
M7 made tenant-scoped (`sso_config`, Thai-default `tax_bracket` rows, `advance_policy`,
the default `document_template` set, `report_schedule` empty), and the first tenant
super-admin user with a hashed temporary password. The endpoint MUST be callable only by
an authenticated platform admin, and the same service MUST be reusable by M10 for
`DEMO_SANDBOX` tenants without a parallel code path.

#### Scenario: Provisioned tenant is immediately usable
- **WHEN** a platform admin provisions a tenant with a plan, a hostname, and an initial admin email
- **THEN** the created super-admin can log in at that hostname and reach every module the plan entitles
- **AND** document numbering, tax brackets, and document templates work without further setup

#### Scenario: Provisioning failure leaves nothing behind
- **WHEN** any step of provisioning fails (e.g. the hostname is already claimed by another `tenant_domain` row)
- **THEN** the transaction rolls back and no tenant, domain, config, or user row persists

### Requirement: Tenant lifecycle state machine with a precise READ_ONLY definition
`tenant.status` SHALL move only along `ACTIVE ↔ READ_ONLY ↔ SUSPENDED → PURGING`, driven
by platform-admin endpoints (M9's subscription expiry drives the same
`ACTIVE → READ_ONLY` transition). A global `TenantStateGuard` MUST enforce, per request:
`ACTIVE` passes; `READ_ONLY` passes every `GET` — explicitly including payroll, payslip,
report, audit-log, and document reads plus PDF rendering and report/data exports — and a
named non-GET allowlist (`/auth/login|refresh|logout`, the PDPA export trigger) while
rejecting every other non-GET with 403 and the new `TENANT_READ_ONLY` error code;
`SUSPENDED` and `PURGING` refuse login with a clear message. Background sweep jobs MUST
skip tenants whose status is not `ACTIVE`.

#### Scenario: Read-only tenant still runs payroll reads and exports
- **WHEN** a tenant is `READ_ONLY` and its HR manager opens a payroll run and downloads a report export
- **THEN** both requests succeed exactly as they would for an `ACTIVE` tenant

#### Scenario: Read-only tenant cannot write
- **WHEN** a user of a `READ_ONLY` tenant submits any business mutation (e.g. `POST /invoices`)
- **THEN** the request is rejected with 403 and error code `TENANT_READ_ONLY`
- **AND** the web client renders the renewal banner, not a generic permission error

#### Scenario: Suspended tenant cannot log in
- **WHEN** a user of a `SUSPENDED` tenant attempts login with correct credentials
- **THEN** login is refused with a message directing them to contact the vendor
- **AND** no session is created

### Requirement: Per-tenant PDPA data export
The system SHALL provide a queued export (`tenant.export`) that snapshots every
business-table row and every stored object belonging to one tenant into an archive under
`tenants/{tid}/exports/`, returning a presigned URL with a bounded TTL
(`TENANT_EXPORT_URL_TTL_MINUTES`). The trigger MUST be available to both the platform
admin and the tenant's own super-admin, and MUST remain available while the tenant is
`READ_ONLY`.

#### Scenario: A read-only tenant exports its data
- **WHEN** the super-admin of a `READ_ONLY` tenant triggers an export
- **THEN** the job completes and they receive a presigned URL to the archive
- **AND** the archive contains one file per business table plus the tenant's stored objects

### Requirement: Purge is gated, queued, ordered, and terminal
`POST /platform/tenants/{id}/purge` SHALL require the tenant to be `SUSPENDED` and a
typed confirmation phrase, set status `PURGING`, and enqueue `tenant.purge`. The worker
MUST delete the tenant's rows in reverse-FK order, delete the `tenants/{tid}/` S3
prefix, then remove users, sessions, domains, and the tenant row itself, recording start
and completion in `platform_audit_log` (which survives the tenant). Retries MUST be
idempotent.

#### Scenario: Purge removes everything except the platform ledger
- **WHEN** a purge job completes for tenant T
- **THEN** no row in any business or platform table references T except `platform_audit_log`
- **AND** no object remains under `tenants/{T}/`

#### Scenario: Purge of an active tenant is refused
- **WHEN** a platform admin calls purge on a tenant whose status is `ACTIVE` or `READ_ONLY`
- **THEN** the request is rejected with 409 STATE_CONFLICT and no status change occurs
