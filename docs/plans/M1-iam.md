# M1 — Access & Identity (IAM)

Spec: [`../BACKEND_SPEC_M1-M6.md`](../BACKEND_SPEC_M1-M6.md) §1. Recipe & shared
primitives: [`README.md`](README.md), [`M0-foundation.md`](M0-foundation.md).

**Depends on:** M0 only. **Unblocks:** every other module (authz). **Build first.**

Responsibilities: authentication, RBAC (users · roles · permissions · templates),
session lifecycle with instant revocation, permission import, and the audit log
consumed by all modules (the table itself is owned by M0; M1 adds the query API).

---

## 1. Contracts — `packages/contracts/src/dto/iam.ts`

Router `iamContract` (pathPrefix `API_PREFIX`), responses via `withErrors`.

- **Auth** (public): `POST /auth/login` `{username,password}` → `{access_token,
  refresh_token,expires_in}`; `POST /auth/refresh` `{refresh_token}`;
  `POST /auth/logout` → 204; `GET /auth/me` → `{user, roles, permissions[]}`.
- **Roles** (`iam.role.manage`): `GET /roles` →
  `[{id,name,permission_count,user_count}]`; `POST /roles`
  `{name,description,permission_codes[]}`; `PUT /roles/{id}` (bumps affected users'
  versions); `POST /roles/{id}/clone` `{name}`; `DELETE /roles/{id}`
  `{super_admin_password}` → 204 | 409 (users bound) | 403 (bad password);
  `GET /permissions` (catalog); `POST /role-templates` `{name,permission_codes[]}`.
- **Users** (`iam.user.manage`): `GET /users` (paginated, `filter[status]`);
  `POST /users` `{employee_id?,username,email,role_ids[],temp_password}`;
  `PUT /users/{id}/roles` `{role_ids[]}`; `POST /users/{id}/force-logout`
  (`iam.user.force_logout`); `POST /users/{id}/status` `{status}`.
- **Import & audit**: `POST /iam/import` multipart(excel) (`iam.role.manage`) →
  `{imported, skipped[]}` | 400; `GET /audit` (`iam.audit.view`, paginated;
  `entity_type`/`entity_id`/`actor`/`from`/`to`).

Enums (`enums/iam.ts`, already partly created in M0): `UserStatus`, `AuditAction`.
Permissions (catalog): `iam.role.manage`, `iam.user.manage`,
`iam.user.force_logout`, `iam.audit.view`.

`login`/`refresh` controllers are `@Public()` (class-level — see M0 ts-rest note).
All other endpoints authorize in-handler with `assertPermissions(user, "...")`.

---

## 2. DB schema — `packages/db/src/schema/iam/`

Extend the M0 `user` table: add `employeeId uuid` FK → `employee(id)` (nullable;
the FK target arrives with M2 — until then keep the column without the constraint,
or add it in the M2 migration). New tables (spec §1.2): `role`
(`name` unique, `is_system`, `cloned_from` self-FK), `permission` (`code` unique),
`role_permission` (PK `(role_id, permission_id)`, cascade), `user_role`
(PK `(user_id, role_id)`), `role_template` (`default_permission_ids uuid[]`).
Re-export from `schema/index.ts`; `pnpm db:generate`; migrate.

Seed: insert the full `permission` catalog from `PERMISSIONS` (a startup/seed task
keeps `permission.code` in sync with the contract catalog).

---

## 3. Nest module — `apps/api/src/iam/`

- **AuthService**: `login` verifies argon2id, enforces lockout (`failedLoginCount
  >= 5` → `lockedUntil = now()+15m`; refuse while locked even with correct
  password), issues access+refresh JWT and creates a `session` row (jti +
  `permissionsVersion` snapshot). `logout` sets `session.revokedAt`. `me` returns
  the user + roles + effective permissions. Emits `UserLoggedIn`.
- **RoleService**: `create`/`update` (PUT replaces `role_permission`; **bumps
  `permissions_version`** for every user bound to the role); `clone` deep-copies
  `role_permission` into a new role with `cloned_from` set; `delete` requires
  `iam.role.manage` **and Super-Admin re-auth** (verify `super_admin_password`
  against the caller; fail → `ReauthRequiredError`/403) **and** 409 if any user is
  still bound. Emits `RoleDeleted`, `PermissionsChanged`.
- **UserService**: `create` (temp password hashed); `setRoles` and `force-logout`
  both **bump `permissions_version`** (force-logout also revokes sessions). Emits
  `PermissionsChanged`, `SessionRevoked`.
- **ImportService**: parse Excel; validate every code against `permission.code`;
  unknown codes → 400 with the offending rows; all-or-nothing in one
  `uow.withTransaction`.
- **Rebind the M0 seam**: provide a `PermissionResolver` that returns the
  role→permission union for a user, and bind it to `PERMISSION_RESOLVER` in
  `IamModule` (overriding M0's empty default). This is the only change needed for
  the global `JwtGuard` to enforce real permissions.
- **Audit**: every authz mutation writes one `audit_log` row
  (`action=PERMISSION_CHANGE`, populated `before`/`after`) — emit events carrying
  the `audit` block (M0 `AuditSubscriber`) inside the same transaction.

Instant revocation mechanics live in M0's guard (`pv` mismatch → 401); M1 just
bumps `permissions_version` on the right operations.

---

## 4. Tests (spec §1.8)

- Changing an online user's roles ⇒ their next request returns 401 (pv mismatch)
  until re-login.
- `DELETE /roles/{id}` without a valid `super_admin_password` ⇒ 403, no data
  change, no audit `DELETE` row.
- Deleting a role still bound to ≥1 user ⇒ 409.
- Every authz mutation writes exactly one `PERMISSION_CHANGE` audit row with
  actor + before/after + timestamp.
- 6 consecutive bad logins ⇒ 15-min lock; correct password during lock ⇒ still
  refused.

Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
