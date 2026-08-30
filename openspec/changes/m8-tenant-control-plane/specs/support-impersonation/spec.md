## ADDED Requirements

### Requirement: Support entry is a reason-tagged, scoped, time-boxed session
A platform admin SHALL enter a tenant only via `POST
/platform/tenants/{id}/support-sessions`, providing a non-empty `reason` (stored
verbatim), a `scope` of `READ_ONLY | FULL`, and a duration ≤
`SUPPORT_SESSION_MAX_MINUTES` (default `SUPPORT_SESSION_DEFAULT_MINUTES` = 60). The
response is a tenant-scoped access token whose claims add `sup: <support_session_id>`;
no refresh token is issued — expiry of the token IS the time-box. `READ_ONLY` scope
requests MUST additionally pass through the `TenantStateGuard` read-only rules
regardless of the tenant's actual status.

#### Scenario: No reason, no session
- **WHEN** a platform admin requests a support session with an empty reason
- **THEN** the request is rejected with 400 VALIDATION_ERROR and no session or token is created

#### Scenario: The time-box is absolute
- **WHEN** a support-session token is used after `expires_at`, or after the session was ended early
- **THEN** the request is rejected with 401
- **AND** there is no way to refresh or extend the token

#### Scenario: Read-only scope cannot write
- **WHEN** a `READ_ONLY`-scope support token attempts any business mutation
- **THEN** the request is rejected with 403 `TENANT_READ_ONLY`

### Requirement: Dual-ledger audit visible to the customer
Every request made under a `sup` token SHALL be attributable end to end: audit rows
written during it carry the support-session id and the true platform-admin actor, and
land in BOTH the tenant's own `audit_log` (readable by the tenant via the M1 audit
query) and `platform_audit_log`. Session open and close (early end or expiry) are
recorded in both ledgers. The platform admin MUST NOT appear as, or authenticate as,
any tenant user.

#### Scenario: The customer can see what support did
- **WHEN** a support session with scope `FULL` corrects a stuck document in tenant T
- **THEN** T's own audit log shows the change, attributed to the support session and platform admin, with before/after
- **AND** `platform_audit_log` carries the same trail

#### Scenario: Sessions end early
- **WHEN** the platform admin calls `POST …/support-sessions/{id}/end`
- **THEN** the session row records the end time and subsequent use of its token returns 401
