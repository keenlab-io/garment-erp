# Authentication

## Purpose
Password-based login with argon2id hashing, JWT access/refresh tokens backed by server-side sessions, and a global guard that protects endpoints by default with instant revocation via a permissions version.

## Requirements

### Requirement: Password hashing with argon2id
The system SHALL hash user passwords with argon2id via a dedicated `PasswordService`, and SHALL verify a submitted password against the stored hash on login. Plaintext passwords and password hashes MUST never be written to logs.

#### Scenario: Password is hashed on creation
- **WHEN** a user account is created or its password is set
- **THEN** the system stores only an argon2id hash of the password
- **AND** the plaintext password is not persisted or logged

#### Scenario: Correct password verifies on login
- **WHEN** a user submits their username and correct password to the login endpoint
- **THEN** `PasswordService` verifies the password against the stored argon2id hash and authentication proceeds

#### Scenario: Incorrect password is rejected
- **WHEN** a user submits an incorrect password
- **THEN** the login is rejected with 401 UNAUTHENTICATED
- **AND** neither the submitted password nor the stored hash appears in any log output

### Requirement: JWT access and refresh tokens
The system SHALL issue JWT tokens via a `TokenService`: the access token payload MUST carry `{ sub, sid, pv }` (user id, session id, permissions version) and the refresh token payload MUST carry `{ sub, sid }`. Signing secrets and token TTLs MUST be read from validated configuration.

#### Scenario: Access token claims
- **WHEN** a user logs in successfully
- **THEN** the issued access token contains `sub` (user id), `sid` (session id), and `pv` (the user's current permissions version)

#### Scenario: Refresh token claims
- **WHEN** a user logs in successfully
- **THEN** the issued refresh token contains `sub` and `sid` and does not carry `pv`

#### Scenario: Secrets and TTLs from configuration
- **WHEN** the API boots
- **THEN** JWT signing secrets and access/refresh TTLs are loaded from environment configuration
- **AND** boot fails fast if the required secrets are missing

### Requirement: Server-side sessions
Login SHALL create a server-side `session` row identified by a token id (jti) and storing a `permissions_version` snapshot, the user id, expiry, and revocation timestamp. Authenticated access MUST require a session that exists, is not revoked, and is not expired.

#### Scenario: Session created on login
- **WHEN** a user logs in successfully
- **THEN** a `session` row is created with a unique token id (jti), the user's current `permissions_version`, and an expiry timestamp
- **AND** the session's token id matches the `sid` claim in the issued tokens

#### Scenario: Revoked session is rejected
- **WHEN** a request presents a valid JWT whose session has `revokedAt` set
- **THEN** the request is rejected with 401 UNAUTHENTICATED

#### Scenario: Expired session is rejected
- **WHEN** a request presents a valid JWT whose session `expiresAt` is in the past
- **THEN** the request is rejected with 401 UNAUTHENTICATED

### Requirement: Global JWT guard
A global `JwtGuard` (registered as `APP_GUARD`) SHALL authenticate every request by: verifying the JWT signature and expiry, loading the session by `sid` (rejecting if revoked or expired), loading the user by `sub` (rejecting if the user's status is not ACTIVE), asserting `user.permissionsVersion === claims.pv`, resolving the user's permissions, and attaching an `AuthUser` object to the request. Any failed step MUST yield 401 UNAUTHENTICATED.

#### Scenario: Valid token attaches AuthUser
- **WHEN** a request carries a valid access token for an ACTIVE user with a live session and matching permissions version
- **THEN** the guard attaches an `AuthUser` (user id, session id, super-admin flag, resolved permissions) to the request and the handler executes

#### Scenario: Invalid or missing token
- **WHEN** a request to a protected endpoint has no token, a malformed token, or a token with an invalid signature or expired `exp`
- **THEN** the request is rejected with 401 UNAUTHENTICATED

#### Scenario: Non-ACTIVE user is rejected
- **WHEN** a request presents a valid token but the user's status is not ACTIVE (e.g. PENDING or disabled)
- **THEN** the request is rejected with 401 UNAUTHENTICATED

### Requirement: Instant revocation via permissions version
The JWT guard MUST reject with 401 any token whose `pv` claim does not equal the user's current `permissionsVersion`, so that bumping a user's `permissions_version` immediately invalidates all of that user's live access tokens.

#### Scenario: Permissions version bump invalidates live tokens
- **WHEN** a user's `permissionsVersion` is incremented while the user holds a previously valid access token
- **THEN** the next request with that token is rejected with 401 UNAUTHENTICATED
- **AND** no cached authorization from the old token is honored

#### Scenario: Matching permissions version passes
- **WHEN** the token's `pv` claim equals the user's current `permissionsVersion`
- **THEN** the guard's version assertion passes and request processing continues

### Requirement: Protected by default with @Public opt-out
All API endpoints SHALL be protected by the global JWT guard by default. An endpoint SHALL be reachable without authentication only when marked with the `@Public()` decorator (e.g. health check, login).

#### Scenario: Unmarked endpoint requires authentication
- **WHEN** a request without credentials is made to an endpoint that is not marked `@Public()`
- **THEN** the request is rejected with 401 UNAUTHENTICATED

#### Scenario: Public endpoint is reachable without a token
- **WHEN** a request without credentials is made to an endpoint marked `@Public()` (such as `/api/v1/health` or the login endpoint)
- **THEN** the request is processed without authentication

### Requirement: Failed-login tracking fields
The user model SHALL include `failedLoginCount` and `lockedUntil` fields to support account lockout, and the authentication layer SHALL be able to reject login for a user whose `lockedUntil` is in the future. (The full lockout policy may be completed in M1; M0 MUST provide the model and guard support.)

#### Scenario: Fields exist on the user model
- **WHEN** the `user` table is migrated
- **THEN** it contains `failedLoginCount` and `lockedUntil` columns

#### Scenario: Locked account cannot log in
- **WHEN** a user whose `lockedUntil` timestamp is in the future attempts to log in with correct credentials
- **THEN** the login is rejected

### Requirement: Login endpoint issues tokens and creates a session
The system SHALL expose `POST /api/v1/auth/login` accepting `{ username, password }`. On success it MUST verify the password against the stored argon2id hash, create a server-side `session` row (unique jti + a `permissions_version` snapshot + expiry), issue an access token (`{ sub, sid, pv }`) and a refresh token (`{ sub, sid }`), update `last_login_at`, reset `failed_login_count` to 0, and emit `UserLoggedIn`. The endpoint MUST be `@Public()` (class level). The response body MUST be `{ access_token, refresh_token, expires_in }`.

#### Scenario: Successful login
- **WHEN** an ACTIVE user posts a correct `{ username, password }` to `/auth/login`
- **THEN** a `session` row is created with a unique jti and the user's current `permissions_version`
- **AND** the response returns `access_token`, `refresh_token`, and `expires_in`
- **AND** the access token's `sid` matches the created session and `pv` matches the user's current permissions version
- **AND** the user's `failed_login_count` is reset to 0 and `last_login_at` is updated

#### Scenario: Wrong password is rejected
- **WHEN** a user posts an incorrect password
- **THEN** the request is rejected with 401 UNAUTHENTICATED
- **AND** no session is created
- **AND** neither the submitted password nor any hash is written to logs

#### Scenario: Login is reachable without a token
- **WHEN** an unauthenticated client posts to `/auth/login`
- **THEN** the global JWT guard does not block the request (the endpoint is `@Public()`)

### Requirement: Refresh endpoint re-issues an access token
The system SHALL expose `POST /api/v1/auth/refresh` accepting `{ refresh_token }`. It MUST verify the refresh token, confirm its session exists and is neither revoked nor expired, and issue a new access token carrying the user's **current** `permissions_version`. The endpoint MUST be `@Public()` (class level).

#### Scenario: Refresh returns a fresh access token
- **WHEN** a client posts a valid `refresh_token` whose session is live
- **THEN** a new access token is issued with the user's current `permissions_version`
- **AND** the response includes `access_token` and `expires_in`

#### Scenario: Refresh with a revoked session is rejected
- **WHEN** a client posts a refresh token whose session has `revoked_at` set
- **THEN** the request is rejected with 401 UNAUTHENTICATED
- **AND** no new access token is issued

### Requirement: Logout revokes the current session
The system SHALL expose `POST /api/v1/auth/logout` (authenticated). It MUST set `revoked_at = now()` on the caller's current session (identified by the token's `sid`) and respond 204. Subsequent requests presenting a token for that session MUST be rejected by the guard.

#### Scenario: Logout revokes the session
- **WHEN** an authenticated user calls `/auth/logout`
- **THEN** the caller's session `revoked_at` is set and the response is 204
- **AND** a later request using a token bound to that session is rejected with 401

### Requirement: Me endpoint returns the caller's identity and permissions
The system SHALL expose `GET /api/v1/auth/me` (authenticated) returning `{ user, roles, permissions[] }`, where `permissions[]` is the caller's effective permission set (the union across the caller's roles; the full catalog for a super-admin).

#### Scenario: Me reflects assigned roles
- **WHEN** an authenticated user with one or more roles calls `/auth/me`
- **THEN** the response contains the user, their roles, and the union of those roles' permission codes

#### Scenario: Me requires authentication
- **WHEN** a request to `/auth/me` carries no valid token
- **THEN** the request is rejected with 401 UNAUTHENTICATED

### Requirement: Account lockout after repeated failed logins
The authentication layer SHALL track failed logins and enforce lockout. On an incorrect password the system MUST increment `failed_login_count`; when it reaches 5 the system MUST set `locked_until = now() + 15 minutes`. While `locked_until` is in the future the system MUST refuse login **even when the submitted password is correct**, returning 401. A successful login MUST reset `failed_login_count` to 0.

#### Scenario: Sixth consecutive bad login locks the account
- **WHEN** a user submits 5 consecutive incorrect passwords
- **THEN** `locked_until` is set to roughly 15 minutes in the future
- **AND** the 6th attempt is rejected with 401

#### Scenario: Correct password during lock is still refused
- **WHEN** a user whose `locked_until` is in the future submits the correct password
- **THEN** the login is rejected with 401 and no session is created

#### Scenario: Lock clears after the window
- **WHEN** a user whose `locked_until` has passed submits the correct password
- **THEN** the login succeeds and `failed_login_count` is reset to 0
