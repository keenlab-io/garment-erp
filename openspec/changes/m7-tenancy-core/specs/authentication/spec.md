## MODIFIED Requirements

### Requirement: JWT access and refresh tokens
The system SHALL issue JWT tokens via a `TokenService`: the access token payload MUST
carry `{ sub, sid, pv, tid }` (user id, session id, permissions version, tenant id) and
the refresh token payload MUST carry `{ sub, sid, tid }`. `tid` SHALL be set from the
tenant that authenticated the login and is thereafter the sole source of tenant identity
(tenant-resolution spec). Support-session tokens additionally carry `sup` (the
`support_session` id). Signing secrets and token TTLs MUST be read from validated
configuration.

#### Scenario: Access token claims
- **WHEN** a user logs in successfully on tenant A's hostname
- **THEN** the issued access token contains `sub`, `sid`, `pv`, and `tid` equal to tenant A's id

#### Scenario: Refresh token claims
- **WHEN** a user logs in successfully
- **THEN** the issued refresh token contains `sub`, `sid`, and `tid` and does not carry `pv`

#### Scenario: Refresh cannot move tenants
- **WHEN** a refresh token for tenant A is presented to `/auth/refresh`
- **THEN** the re-issued access token carries the same `tid` — refresh never changes tenant identity

#### Scenario: Secrets and TTLs from configuration
- **WHEN** the API boots
- **THEN** JWT signing secrets and access/refresh TTLs are loaded from environment configuration
- **AND** boot fails fast if the required secrets are missing

### Requirement: Server-side sessions
Login SHALL create a server-side `session` row identified by a token id (jti) and
storing a `permissions_version` snapshot, the user id, **the tenant id**, expiry, and
revocation timestamp. Authenticated access MUST require a session that exists, is not
revoked, is not expired, and whose `tenant_id` equals the token's `tid` claim. The
`session` table falls under Row-Level Security like any business table.

#### Scenario: Session created on login
- **WHEN** a user logs in successfully
- **THEN** a `session` row is created with a unique token id (jti), the user's current `permissions_version`, the tenant id, and an expiry timestamp

#### Scenario: Revoked session is rejected
- **WHEN** a request presents a valid JWT whose session has `revokedAt` set
- **THEN** the request is rejected with 401 UNAUTHENTICATED

#### Scenario: Expired session is rejected
- **WHEN** a request presents a valid JWT whose session `expiresAt` is in the past
- **THEN** the request is rejected with 401 UNAUTHENTICATED

#### Scenario: Tenant-mismatched session is rejected
- **WHEN** a token's `tid` claim does not equal the session row's `tenant_id`
- **THEN** the request is rejected with 401 UNAUTHENTICATED

## ADDED Requirements

### Requirement: Credentials and lockout are tenant-scoped
Login SHALL resolve credentials by `(tenant_id, username)` against the tenant resolved
from the request hostname; `user.username` and `user.email` are unique per tenant, not
globally, so the same username may exist independently in two tenants. The
failed-login counter and `lockedUntil` window therefore apply per tenant account: bad
attempts against tenant A's `somchai` never lock tenant B's `somchai`. The `JwtGuard`'s
user and session lookups run inside a transaction scoped to the token's `tid`, so
authentication itself is subject to Row-Level Security.

#### Scenario: Same username in two tenants
- **WHEN** tenant A and tenant B each have a user named `somchai` and each logs in on their own hostname
- **THEN** both logins succeed against their own tenant's credentials

#### Scenario: Lockout does not cross tenants
- **WHEN** five consecutive bad passwords are submitted for `somchai` on tenant A's hostname
- **THEN** tenant A's account locks for the configured window
- **AND** tenant B's `somchai` logs in unaffected

#### Scenario: Login on the wrong host finds no account
- **WHEN** tenant A's user submits valid credentials on tenant B's hostname
- **THEN** the lookup against `(tenant B, username)` finds no match and the login is rejected with 401
