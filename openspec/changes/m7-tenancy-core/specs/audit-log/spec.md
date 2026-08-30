## MODIFIED Requirements

### Requirement: Audit entries capture actor, action, entity, and timestamp
Each `audit_log` entry SHALL capture who performed the action, what action was
performed, which entity was affected, when it occurred, and **which tenant it belongs
to**: `audit_log.tenant_id` is NOT NULL, populated from `currentTenantId()`, and the
table is under Row-Level Security — a tenant's audit trail is that tenant's data and is
never visible to another tenant. When the acting principal is a support session, the
entry SHALL attribute the action to the support session so the customer can see that
support touched their data.

#### Scenario: Entry fields are populated
- **WHEN** an audited action is performed by a user of tenant A
- **THEN** the `audit_log` row records the actor, action, entity type/id, timestamp, and tenant A's id

#### Scenario: Audit queries are tenant-scoped
- **WHEN** tenant B's admin queries `GET /audit`
- **THEN** only tenant B's audit rows are returned, with tenant A's rows present in the table

#### Scenario: Support actions are attributed
- **WHEN** an action is performed under a support-session token
- **THEN** the tenant's audit row identifies the support session as the actor context

## ADDED Requirements

### Requirement: Control-plane actions go to a separate platform audit log
Control-plane events — platform-admin login, tenant provisioning, tenant status changes,
support-session open/close, and every request made under a support session — SHALL be
recorded in the append-only `platform_audit_log` table (same BEFORE UPDATE/DELETE
trigger enforcement as `audit_log`), which is in the `TENANT_EXEMPT` allowlist, outside
tenant RLS, readable only through the platform surface, and MUST survive tenant purges.
Support-session actions are dual-written: once to the tenant's `audit_log`, once to
`platform_audit_log`.

#### Scenario: Provisioning leaves a platform trail
- **WHEN** a platform admin provisions a tenant
- **THEN** a `platform_audit_log` row records the admin, the action, the tenant id, and the timestamp
- **AND** no tenant `audit_log` row is required for the control-plane act itself

#### Scenario: Platform audit rows are immutable
- **WHEN** an UPDATE or DELETE is attempted against a `platform_audit_log` row
- **THEN** the database trigger rejects the statement

#### Scenario: Support-session activity is dual-written
- **WHEN** a support-session token voids a tenant document
- **THEN** the void is audited in the tenant's `audit_log` and mirrored in `platform_audit_log`

#### Scenario: Platform trail survives the tenant
- **WHEN** a tenant is purged
- **THEN** its `audit_log` rows go with it while every `platform_audit_log` row referencing it remains
