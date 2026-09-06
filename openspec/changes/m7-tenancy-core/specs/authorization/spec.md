## MODIFIED Requirements

### Requirement: Super-admin bypass
A user whose `isSuperAdmin` flag is true SHALL be a **tenant super-admin**: both the
`PermissionsGuard` and `assertPermissions` MUST allow such users regardless of their
resolved permission set, **within their own tenant only**. Because every request runs
scoped to the token's `tid` under Row-Level Security, a tenant super-admin has no path
to another tenant's data — the bypass applies to permission codes, never to the tenant
boundary. No principal authenticated through the tenant login surface bypasses tenant
isolation.

#### Scenario: Super-admin passes without permissions
- **WHEN** a tenant super-admin requests an endpoint requiring a permission code that is not in their resolved permission set
- **THEN** the request is allowed

#### Scenario: Super-admin still requires authentication
- **WHEN** a request with no valid token targets a protected endpoint
- **THEN** the request is rejected with 401 regardless of any super-admin bypass

#### Scenario: Super-admin cannot cross the tenant boundary
- **WHEN** tenant A's super-admin requests a document id belonging to tenant B
- **THEN** the response is 404 NOT_FOUND — the permission bypass grants nothing outside tenant A's rows

## ADDED Requirements

### Requirement: Platform administrator is a separate principal
Platform operations SHALL authenticate against the `platform_admin` table through a
separate login surface (`POST /platform/auth/login`, `apps/api/src/platform/`), with
credentials, lockout, and tokens fully disjoint from tenant users: a platform token MUST
never pass the tenant `JwtGuard`, and a tenant token MUST never pass the platform guard.
Platform admins can provision tenants and change tenant status, but MUST have no route
to read or write tenant business data through the ordinary API — entering a tenant
requires a support session. Platform-admin actions are recorded in the append-only
`platform_audit_log`.

#### Scenario: Token surfaces are disjoint
- **WHEN** a platform-admin token is presented to `GET /invoices` and a tenant token is presented to `GET /platform/tenants`
- **THEN** both requests are rejected with 401 UNAUTHENTICATED

#### Scenario: Provisioning is platform-audited
- **WHEN** a platform admin provisions a new tenant
- **THEN** a `platform_audit_log` row records the admin, action, tenant, and timestamp

### Requirement: Support sessions are the only impersonation path
A platform admin SHALL enter a tenant only via an explicit `support_session` carrying a
non-blank reason and a hard expiry. Opening one mints a time-boxed tenant-scoped access
token whose claims carry `tid` plus `sup` (the support-session id). Every request made
under `sup` MUST be audited into both the tenant's `audit_log` (visible to the customer)
and `platform_audit_log`. Expiry or revocation of the support session invalidates the
token; there is no silent or standing platform access to tenant data.

#### Scenario: Reason and time-box are mandatory
- **WHEN** a platform admin attempts to open a support session with a blank reason or no expiry
- **THEN** the request is rejected with a validation error and no token is minted

#### Scenario: Support activity is visible to the tenant
- **WHEN** a support-session token is used to view a tenant's invoice
- **THEN** an audit row appears in that tenant's own `audit_log` attributing the action to the support session
- **AND** a matching row appears in `platform_audit_log`

#### Scenario: Expiry cuts access
- **WHEN** a support session passes its `expires_at` (or is revoked) and its token is presented again
- **THEN** the request is rejected with 401 UNAUTHENTICATED
