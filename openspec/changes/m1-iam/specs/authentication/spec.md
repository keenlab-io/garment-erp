## ADDED Requirements

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
