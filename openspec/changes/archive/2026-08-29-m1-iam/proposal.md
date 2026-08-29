# M1 — Access & Identity (IAM)

## Why

M1 is the first business module and the one every other module depends on: it turns the
M0 authorization *seam* into a real role-based access-control system. M0 shipped the
platform tables (`user`, `session`, `audit_log`), the JWT auth stack, and a pluggable
`PERMISSION_RESOLVER` whose default returns the **empty** permission set — so today only
super-admins pass any permission check. Until M1 binds that resolver to a role→permission
union, no non-super-admin user can be granted access to anything, and there is no way to
create users, define roles, revoke sessions, import a permission matrix, or read the
audit trail. M1 delivers exactly that surface, and because M0 built the revocation and
audit mechanics generically, M1 rebinds one DI token rather than reworking the guard.

The backend contract is already implementation-ready in `docs/BACKEND_SPEC_M1-M6.md` §1
and the engineering recipe in `docs/plans/M1-iam.md`; this change captures it as
spec-driven artifacts. Scope is **backend only** (`@erp/contracts`, `@erp/db`,
`apps/api`); the IAM admin screens in `apps/web` are a later change.

## What Changes

- **Authentication HTTP surface**: the actual `POST /auth/login`, `/auth/refresh`,
  `/auth/logout`, and `GET /auth/me` endpoints (M0 built `PasswordService`/`TokenService`
  and the session model but shipped no login route), plus the **full account-lockout
  policy** — 5 consecutive bad passwords lock the account for 15 minutes, and a correct
  password during the lock window is still refused.
- **Role-based authorization**: M1 provides a `RolePermissionResolver` and rebinds the
  M0 `PERMISSION_RESOLVER` token to the union of permissions across a user's roles.
  **No M0 guard, seam, or handler code changes** — the global `JwtGuard` immediately
  enforces real permissions.
- **RBAC model & management**: new `role`, `permission`, `role_permission`, `user_role`,
  and `role_template` tables, plus role CRUD (create, update, clone, delete), a permission
  catalog endpoint, and role templates. Deleting a role requires **super-admin
  re-authentication** and is rejected while any user is still bound to it.
- **User management**: user listing (paginated, status-filtered), creation with a hashed
  temp password, role assignment, account status changes, and **force-logout** (revokes
  all sessions).
- **Instant revocation wired to authz changes**: role edits, user role changes, and
  force-logout all bump the user's `permissions_version`, so the next request with an old
  token returns 401 — the single mechanism behind instant revocation (M0 design D5/D6).
- **Excel permission import**: `POST /iam/import` ingests rows of *role name + permission
  codes*, validates every code against the catalog, and creates/updates roles
  all-or-nothing in one transaction (unknown codes → 400 with the offending rows).
- **Audit query API**: `GET /audit` — a filtered, paginated read API over the M0
  append-only `audit_log`. M1 owns the *read* path; the *write* path is M0's.
- **Enum/catalog housekeeping**: add `FORCE_LOGOUT` to `AuditAction` (contracts + db,
  kept in lockstep by the parity test); add a nullable `user.employeeId` column (FK to
  `employee` deferred to M2); seed the `permission` table from the `@erp/contracts`
  `PERMISSIONS` catalog.

No breaking changes to end users (pre-release). The permission catalog already contains
the four `iam.*` codes; no new codes are introduced.

## Capabilities

### New Capabilities

- `role-management`: roles, the persisted permission catalog, and their bindings —
  create/update/clone/delete roles (delete gated by super-admin re-auth and blocked while
  users are bound), the `GET /permissions` catalog, role templates, and the rule that
  editing a role bumps every bound user's `permissions_version`.
- `user-management`: user lifecycle for admins — paginated/status-filtered listing, create
  with a hashed temp password and optional employee link, role assignment, status change,
  and force-logout (bumps version + revokes all sessions).
- `permission-import`: all-or-nothing Excel import of role→permission-code rows, validated
  against the catalog, in a single transaction.
- `audit-query`: filtered, cursor-paginated read API over the M0 `audit_log`
  (`entity_type`/`entity_id`/`actor`/`from`/`to`), gated by `iam.audit.view`.

### Modified Capabilities

- `authentication`: adds the auth HTTP endpoints (`login`/`refresh`/`logout`/`me`) and
  completes the account-lockout policy that M0 stubbed as tracking fields only.
- `authorization`: rebinds the M0 permission-resolver seam to a real role→permission union
  so effective permissions become the union across a user's roles (super-admin still
  bypasses).

## Impact

- **Packages**
  - `@erp/contracts` — new `dto/iam.ts` (`iamContract`: auth, roles, users, import,
    audit), registered under a new `iam` key on the root `contract`; `enums/iam.ts`
    extended with `AuditAction.FORCE_LOGOUT`. No change to money/qty or existing DTOs.
  - `@erp/db` — new `schema/iam/` tables (`role`, `permission`, `role_permission`,
    `user_role`, `role_template`); `user` gains a nullable `employeeId` column (no FK
    yet); `schema/enums.ts` gains `FORCE_LOGOUT`; migration generated; seed extended to
    upsert the permission catalog.
  - `apps/api` — new `iam/` module (`AuthService`, `RoleService`, `UserService`,
    `ImportService`, `RolePermissionResolver`, ts-rest controller) wired into
    `app.module.ts`; rebinds `PERMISSION_RESOLVER`.
- **New runtime dependency**: `exceljs` in `apps/api` for the permission import parser.
- **Infra**: none — no new services; reuses M0's Postgres/Redis/JWT config.
- **Downstream**: M2–M6 gain enforced permission checks and a working audit query;
  `user.employeeId`'s FK to `employee(id)` is added by the M2 migration.
