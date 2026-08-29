## ADDED Requirements

### Requirement: List users
The system SHALL expose `GET /api/v1/users` (perm `iam.user.manage`) with cursor
pagination and an optional `filter[status]`. The response MUST use the standard
`{ data, next_cursor }` shape and MUST NOT include password hashes.

#### Scenario: Paginated, status-filtered listing
- **WHEN** a user with `iam.user.manage` calls `GET /users?filter[status]=ACTIVE&limit=50`
- **THEN** the response returns only ACTIVE users in `{ data, next_cursor }` form
- **AND** no `password_hash` field appears in any returned user

### Requirement: Create a user with a hashed temp password
The system SHALL expose `POST /api/v1/users` `{ employee_id?, username, email, role_ids[], temp_password }`
(perm `iam.user.manage`). The temp password MUST be stored only as an argon2id hash. The
user MUST be created with its assigned roles. Unknown `role_ids` MUST be rejected (400/404);
a duplicate `username` or `email` MUST be rejected (409).

#### Scenario: Create persists a hashed password and roles
- **WHEN** an admin creates a user with a temp password and one or more `role_ids`
- **THEN** the user is stored with an argon2id hash (never the plaintext) and the given roles
- **AND** the response does not echo the password or its hash

#### Scenario: Duplicate username is rejected
- **WHEN** the requested `username` or `email` already exists (case-insensitive)
- **THEN** the request is rejected with 409 STATE_CONFLICT

### Requirement: Set a user's roles bumps their permissions version
The system SHALL expose `PUT /api/v1/users/{id}/roles` `{ role_ids[] }` (perm
`iam.user.manage`) that replaces the user's `user_role` rows and increments the user's
`permissions_version` in the same transaction. Unknown `role_ids` MUST be rejected.

#### Scenario: Role change logs the user out
- **WHEN** an online user's roles are changed
- **THEN** the user's `user_role` rows are replaced and `permissions_version` is incremented
- **AND** the user's next request with the old token returns 401 until re-login

### Requirement: Force-logout revokes sessions and bumps version
The system SHALL expose `POST /api/v1/users/{id}/force-logout` (perm
`iam.user.force_logout`) that increments the user's `permissions_version` and sets
`revoked_at` on all of the user's live sessions, within one transaction, and emits
`PermissionsChanged` and `SessionRevoked`. The response is 204.

#### Scenario: Force-logout invalidates all live tokens
- **WHEN** an admin force-logs-out a user who holds valid tokens across two sessions
- **THEN** both sessions are revoked and `permissions_version` is incremented
- **AND** any subsequent request with any of that user's prior tokens returns 401

#### Scenario: Force-logout is audited as FORCE_LOGOUT
- **WHEN** a force-logout succeeds
- **THEN** exactly one `audit_log` row is written with `action = FORCE_LOGOUT`, the actor, and timestamp

### Requirement: Change a user's status
The system SHALL expose `POST /api/v1/users/{id}/status` `{ status }` (perm
`iam.user.manage`) that sets the user's status to a valid `UserStatus`
(`ACTIVE` | `DISABLED` | `PENDING`). Setting `DISABLED` MUST prevent the user from
authenticating on subsequent requests (the guard rejects non-ACTIVE users).

#### Scenario: Disabling a user blocks access
- **WHEN** an admin sets a user's status to `DISABLED`
- **THEN** the user's subsequent authenticated requests are rejected with 401
- **AND** the change is recorded in `audit_log`
