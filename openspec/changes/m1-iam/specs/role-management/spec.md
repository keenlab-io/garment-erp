## ADDED Requirements

### Requirement: Persisted permission catalog
The system SHALL maintain a `permission` table whose `code` column mirrors the
`@erp/contracts` `PERMISSIONS` catalog, seeded/upserted at startup so every catalog code
has exactly one row. `GET /api/v1/permissions` (perm `iam.role.manage`) MUST return the
catalog of codes. Role and import operations MUST validate referenced codes against this
table.

#### Scenario: Catalog is seeded from the typed catalog
- **WHEN** the seed runs
- **THEN** the `permission` table contains one row per code in `@erp/contracts` `PERMISSIONS`
- **AND** re-running the seed does not create duplicates

#### Scenario: Permissions endpoint returns the catalog
- **WHEN** a user with `iam.role.manage` calls `GET /permissions`
- **THEN** the response lists the permission codes from the catalog

### Requirement: Create and list roles
The system SHALL expose `POST /api/v1/roles` `{ name, description, permission_codes[] }`
and `GET /api/v1/roles` (perm `iam.role.manage`). Create MUST reject unknown permission
codes (400) and duplicate role names (409), and persist the role plus its
`role_permission` rows. List MUST return each role with its `permission_count` and
`user_count`.

#### Scenario: Create a role with valid codes
- **WHEN** a user with `iam.role.manage` posts a role with a unique name and known permission codes
- **THEN** the role and its `role_permission` rows are created
- **AND** the response returns the new role

#### Scenario: Create with an unknown code is rejected
- **WHEN** the request includes a permission code absent from the catalog
- **THEN** the request is rejected with 400 VALIDATION_ERROR and no role is created

#### Scenario: List includes counts
- **WHEN** a user with `iam.role.manage` calls `GET /roles`
- **THEN** each returned role carries its `permission_count` and `user_count`

### Requirement: Update a role bumps affected users' permissions version
The system SHALL expose `PUT /api/v1/roles/{id}` `{ name?, description?, permission_codes[]? }`
(perm `iam.role.manage`). When `permission_codes` is supplied the update MUST **replace**
the role's `role_permission` rows. Any update that changes the role's effective permissions
MUST increment `permissions_version` for **every** user bound to the role, within the same
transaction. Unknown codes MUST be rejected (400).

#### Scenario: Editing permissions replaces the set and bumps versions
- **WHEN** a role's `permission_codes` are changed and three users are bound to that role
- **THEN** the role's `role_permission` rows are replaced with the new set
- **AND** all three users' `permissions_version` values are incremented in the same transaction

#### Scenario: Online user is logged out after a role edit
- **WHEN** a bound user holds a valid access token and their role's permissions are edited
- **THEN** the user's next request with that token is rejected with 401 until re-login

### Requirement: Clone a role
The system SHALL expose `POST /api/v1/roles/{id}/clone` `{ name }` (perm `iam.role.manage`)
that creates a new role deep-copying the source role's `role_permission` rows and setting
`cloned_from` to the source id. The clone MUST be independently editable thereafter.

#### Scenario: Clone deep-copies permissions
- **WHEN** a user clones a role under a new name
- **THEN** a new role is created with the same permission set, `cloned_from` set to the source
- **AND** editing the clone does not affect the source role

### Requirement: Delete a role requires super-admin re-auth and no bound users
The system SHALL expose `DELETE /api/v1/roles/{id}` `{ super_admin_password }` (perm
`iam.role.manage`). It MUST verify `super_admin_password` against the caller's own password
hash and reject with 403 REAUTH_REQUIRED on mismatch. It MUST reject with 409 STATE_CONFLICT
if any user is still bound to the role. System roles (`is_system = true`) MUST NOT be
deletable. On a rejected delete, no data changes and no audit row is written. A successful
delete returns 204.

#### Scenario: Delete with a bad super-admin password
- **WHEN** the request's `super_admin_password` does not match the caller's password
- **THEN** the request is rejected with 403 REAUTH_REQUIRED
- **AND** no role is deleted and no audit row is written

#### Scenario: Delete a role still bound to a user
- **WHEN** at least one user is bound to the target role
- **THEN** the request is rejected with 409 STATE_CONFLICT and the role remains

#### Scenario: Successful delete
- **WHEN** the super-admin password is correct and no user is bound to the role
- **THEN** the role is deleted, the response is 204, and a `RoleDeleted` event is emitted

### Requirement: Role templates
The system SHALL expose `POST /api/v1/role-templates` `{ name, permission_codes[] }` (perm
`iam.role.manage`) that stores a reusable template. Referenced permission codes MUST be
validated against the catalog (400 on unknown).

#### Scenario: Create a role template
- **WHEN** a user with `iam.role.manage` posts a template with known codes
- **THEN** the template is stored with its default permission set

#### Scenario: Template with an unknown code is rejected
- **WHEN** a template references a code absent from the catalog
- **THEN** the request is rejected with 400 VALIDATION_ERROR

### Requirement: Authz mutations are audited
Every role mutation (create, update, clone, delete) SHALL write exactly one `audit_log`
row with `action = PERMISSION_CHANGE`, the acting user, a timestamp, and populated
`before`/`after` snapshots, within the same transaction as the change. Role edits and
deletes MUST emit `PermissionsChanged` / `RoleDeleted` accordingly.

#### Scenario: A role edit writes one audit row
- **WHEN** a role's permissions are updated
- **THEN** exactly one `audit_log` row is written with `action = PERMISSION_CHANGE`, the actor, timestamp, and `before`/`after`
