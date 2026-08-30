## MODIFIED Requirements

### Requirement: Login endpoint issues tokens and creates a session
The system SHALL expose `POST /api/v1/auth/login` accepting `{ username, password }`. The
caller SHALL be resolved through their `auth_identity` row with `provider = PASSWORD`
(`subject` = username), scoped to the hostname-resolved tenant (m7); the argon2id hash is
verified from `user.password_hash` as before (design D8 — the hash does not move). On
success it MUST create a server-side `session` row (unique jti + a `permissions_version`
snapshot + expiry), issue an access token (`{ sub, sid, pv, tid }`) and a refresh token
(`{ sub, sid }`), update `last_login_at` on both the user and the `PASSWORD` identity,
reset `failed_login_count` to 0, and emit `UserLoggedIn`. A user with **no** `PASSWORD`
identity (an OIDC-only account, e.g. a demo guest) MUST be refused password login with
401 UNAUTHENTICATED regardless of any password value submitted. The endpoint MUST be
`@Public()` (class level). The response body MUST be
`{ access_token, refresh_token, expires_in }`.

#### Scenario: Successful login
- **WHEN** an ACTIVE user posts a correct `{ username, password }` to `/auth/login`
- **THEN** the caller is resolved via the `(tenant_id, PASSWORD, username)`
  `auth_identity` row and a `session` row is created with a unique jti and the user's
  current `permissions_version`
- **AND** the response returns `access_token`, `refresh_token`, and `expires_in`
- **AND** the access token's `sid` matches the created session, `pv` matches the user's
  current permissions version, and `tid` matches the user's tenant
- **AND** the user's `failed_login_count` is reset to 0 and `last_login_at` is updated on
  the user and the identity row

#### Scenario: Wrong password is rejected
- **WHEN** a user posts an incorrect password
- **THEN** the request is rejected with 401 UNAUTHENTICATED
- **AND** no session is created
- **AND** neither the submitted password nor any hash is written to logs

#### Scenario: OIDC-only account cannot use password login
- **WHEN** a login is posted for a user whose only `auth_identity` rows have
  `provider = GOOGLE` (no `PASSWORD` identity — e.g. a demo sandbox guest)
- **THEN** the request is rejected with 401 UNAUTHENTICATED
- **AND** no session is created and no lockout counter is incremented for a nonexistent
  password credential

#### Scenario: Login is reachable without a token
- **WHEN** an unauthenticated client posts to `/auth/login`
- **THEN** the global JWT guard does not block the request (the endpoint is `@Public()`)
