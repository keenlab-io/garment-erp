# M1 — Access & Identity (IAM): Design

## Context

M0 built the authorization *mechanism* and deliberately deferred the *policy* to M1
(M0 design D6, Non-Goals). Concretely, M0 shipped:

- Platform tables `user`, `session`, `audit_log` (`packages/db/src/schema/platform/`),
  the `user` row already carrying `permissionsVersion`, `isSuperAdmin`,
  `failedLoginCount`, `lockedUntil`, and `version`.
- `PasswordService` (argon2id), `TokenService` (access `{ sub, sid, pv }` / refresh
  `{ sub, sid }`), the global `JwtGuard` (verifies token → session live → user ACTIVE →
  `permissionsVersion === pv` → resolves permissions → attaches `AuthUser`), and
  `assertPermissions` for in-handler ts-rest authorization
  (`apps/api/src/auth/`).
- Three DI seams in `auth.tokens.ts` — `USER_LOOKUP`, `SESSION_LOOKUP`,
  `PERMISSION_RESOLVER` — the last defaulting to an **empty** permission set so that in
  M0 only super-admins pass checks.
- Cross-cutting infra M1 reuses verbatim: `UnitOfWork.withTransaction` +
  `currentExecutor(db)`, `AppException` subclasses (incl. `ReauthRequiredError`,
  `StateConflictError`, `NotFoundError`, `BusinessRuleError`), `EventBusService` +
  the `@OnEvent("**")` `AuditSubscriber`, `buildPage` (cursor pagination), and the
  `withErrors`/`paginated`/`API_PREFIX` contract helpers.

This document records how M1 turns that seam into RBAC and where the shipped code forced
choices that diverge from the wording of `docs/BACKEND_SPEC_M1-M6.md` §1. The spec and
`docs/plans/M1-iam.md` are the source; decisions below note deviations.

## Goals / Non-Goals

**Goals:**

- Real role-based authorization that the M0 guard enforces with **zero M0 code changes** —
  achieved by rebinding one DI token.
- Complete the authentication story with the actual login/refresh/logout/me endpoints and
  a working lockout policy.
- Full role and user administration (CRUD, clone, templates, status, force-logout) with
  instant revocation on every authz change.
- All-or-nothing Excel import of a role→permission matrix.
- A filtered, paginated audit read API over M0's append-only log.
- Every authz mutation writes exactly one audit row with populated `before`/`after`.

**Non-Goals:**

- **No frontend** — `apps/web` IAM screens are a separate change.
- **No employee/HR model** — `user.employeeId` is added as a bare column; the FK to
  `employee(id)` and everything HR is M2.
- **No transactional outbox** — M1 keeps M0's after-commit dispatch (workers idempotent on
  `(event, correlation_id)`); the outbox remains an open M0/M1 item, not implemented here.
- **No refresh-token rotation/reuse-detection hardening** — see Open Questions.
- **No new permission codes** — the catalog already carries the four `iam.*` codes.

## Decisions

### D1. Rebind `PERMISSION_RESOLVER`; never fork M0

M1 implements `RolePermissionResolver` (`apps/api/src/iam/`) whose `resolve(userId)`
returns the union of `permission.code` across the user's roles
(`user_role ⋈ role_permission ⋈ permission`), read through `currentExecutor(db)` so it
honors any ambient transaction. `IamModule` provides
`{ provide: PERMISSION_RESOLVER, useClass: RolePermissionResolver }`, which overrides the
`@Global` M0 `AuthModule` default. This is the *only* wiring change needed for the global
`JwtGuard` to enforce real permissions (M0 design D6).

*Alternative considered:* editing the guard to query roles directly — rejected; it breaks
the seam abstraction and couples M0 to the RBAC schema.

*Consequence:* the resolver runs on every authenticated request. It is a small indexed
join; if it becomes hot, a short-TTL per-user cache keyed by `permissions_version` is the
natural follow-up (not needed now).

### D2. Instant revocation = a `permissions_version` bump

Every operation that changes a user's effective permissions — `PUT /roles/{id}` (for each
bound user), `PUT /users/{id}/roles`, and `POST /users/{id}/force-logout` — increments
`user.permissions_version` inside the same transaction. The M0 guard already rejects any
token whose `pv` ≠ the user's current version, so the next request with a stale token
returns 401. Force-logout additionally sets `session.revokedAt` on the user's live
sessions. M1 introduces no blocklist or new revocation path (M0 design D5).

### D3. `UserStatus` follows the shipped M0 enum, not the spec wording

M0 shipped `UserStatus = PENDING | ACTIVE | DISABLED` (`@erp/contracts/enums/iam.ts` and
`@erp/db/schema/enums.ts`, kept in lockstep by an `expectTypeOf` parity test), with
lockout tracked by the `lockedUntil` timestamp rather than a status value. BACKEND_SPEC
§1.3 instead lists `ACTIVE | INACTIVE | LOCKED | PENDING`. M1 **keeps the shipped enum**:
map the spec's `INACTIVE` → `DISABLED`, and represent lockout via `lockedUntil` (never a
`LOCKED` status). `POST /users/{id}/status` accepts `ACTIVE`/`DISABLED` (with `PENDING` as
the initial, pre-activation state). Changing the enum would break the parity test and the
guard's ACTIVE check for no functional gain.

*Alternative considered:* adding `LOCKED`/`INACTIVE` to match the spec text — rejected;
duplicates the `lockedUntil` mechanism and ripples through M0's guard and parity test.

### D4. Add `FORCE_LOGOUT` to `AuditAction`

BACKEND_SPEC §1.3 lists `FORCE_LOGOUT`; M0's enum omitted it. M1 adds it to **both**
`@erp/contracts/enums/iam.ts` and `@erp/db/schema/enums.ts` so the parity test stays
green. Force-logout audits as `action=FORCE_LOGOUT`; all other authz mutations
(role create/update/clone/delete, user create/role-change/status) audit as
`PERMISSION_CHANGE` per BACKEND_SPEC §1.8.

### D5. `user.employeeId` column now, FK later

M1 adds `employeeId uuid` (nullable) to `user` so accounts can link to employees, but
**without** the FK constraint — the target `employee(id)` table arrives in M2. The M2
migration adds the constraint (per `docs/plans/M1-iam.md` §2). System accounts (e.g. the
seeded super-admin) leave it null.

### D6. Super-admin re-auth for role deletion

`DELETE /roles/{id}` carries `super_admin_password` in the body. The service verifies it
against the **caller's own** `passwordHash` via `PasswordService.verify`; a mismatch
throws `ReauthRequiredError` → 403 `REAUTH_REQUIRED` (the code and exception already exist
in M0). The delete is additionally blocked with `StateConflictError` → 409 if any
`user_role` row still references the role, and system roles (`is_system = true`) are never
deletable. On a rejected delete, **no** row is written and **no** audit entry is created
(BACKEND_SPEC §1.8).

### D7. Excel import via `exceljs`, all-or-nothing

`ImportService` parses the uploaded workbook with `exceljs` (actively maintained;
preferred over `xlsx` for its security track record), reading rows of
`role_name | permission_codes`. It validates **every** referenced code against
`permission.code`; if any row references an unknown code the whole import fails with
400 `VALIDATION_ERROR` whose `details[]` names the offending rows — nothing is written.
On success it upserts roles and replaces their `role_permission` rows inside one
`uow.withTransaction`, bumps the `permissions_version` of every affected bound user, and
returns `{ imported, skipped[] }` (skipped = rows intentionally not applied, e.g. empty).

### D8. Permission catalog is seeded, not user-authored

The `permission` table is the persisted mirror of the `@erp/contracts` `PERMISSIONS`
array. The M0 seed is extended to `upsert` one `permission` row per catalog code
(`onConflictDoNothing` on `code`), so `permission.code` stays in sync with the typed
catalog and `GET /permissions` returns it. Roles reference permissions by code; the
import and role endpoints validate against this table.

### D9. Contract shape reuses M0 primitives

`iamContract` (`packages/contracts/src/dto/iam.ts`) is a ts-rest router with
`pathPrefix: API_PREFIX`, every route wrapped in `withErrors(...)`; list endpoints use
`paginationQuery` + `paginated(item)`; `login`/`refresh` handlers sit on a `@Public()`
class, all others authorize in-handler via `assertPermissions(user, "iam.…")` (M0 design
D7 — ts-rest hides method metadata from guards). The router is registered under a new
`iam` key on the root `contract` in `dto/index.ts`.

## Risks / Trade-offs

- **[Resolver on every request]** — `RolePermissionResolver` joins three tables per
  authenticated call. → Accepted; indexed PK/FK joins on small RBAC tables. A
  `permissions_version`-keyed cache is the escape hatch if profiling shows it hot.
- **[Spec/enum divergence (`UserStatus`, `FORCE_LOGOUT`)]** — the delta specs describe
  behavior that differs from BACKEND_SPEC §1.3's literal enum lists. → Resolved
  deliberately (D3/D4) and documented so reviewers don't "fix" it back into a parity-test
  break.
- **[Deleting a role mid-use]** — a role could be edited/bound concurrently with a delete.
  → The bound-user check and the delete run in one transaction; the `user_role` FK plus
  the 409 guard prevent orphaning.
- **[Excel parsing surface]** — importing arbitrary workbooks is an untrusted-input path.
  → `exceljs` (not `xlsx`), strict row/column validation, size-bounded upload, and
  all-or-nothing semantics; only permission *codes* are trusted after catalog validation.
- **[`permissions_version` fan-out on role edit]** — editing a widely-assigned role bumps
  many users' versions, logging many out at once. → Intended (that *is* instant
  revocation); done in one transaction so it's atomic and audited.
- **[Lockout self-DoS]** — an attacker could lock a known account with bad passwords. →
  Accepted for M1 (matches the spec); the 15-minute window auto-clears and lockout is
  audited. IP throttling is a later hardening item.

## Migration Plan

Additive, pre-release — no data migration:

1. **Contracts first**: extend `enums/iam.ts` (`FORCE_LOGOUT`); add `dto/iam.ts`
   (`iamContract`) and register it on the root `contract`. Keep `pnpm build/typecheck/lint`
   green.
2. **DB**: add `schema/iam/` tables + `user.employeeId` + `FORCE_LOGOUT` to
   `schema/enums.ts`; re-export from `schema/index.ts`; `pnpm db:generate`; extend the
   seed to upsert the permission catalog; `pnpm db:migrate && pnpm db:seed`.
3. **API**: build `apps/api/src/iam/` (resolver, services, controller, module) and wire it
   into `app.module.ts`, rebinding `PERMISSION_RESOLVER`; add `exceljs`.
4. **Tests**: the BACKEND_SPEC §1.8 acceptance criteria as unit + integration specs.

Acceptance: `pnpm build && typecheck && lint && test` green; login → guarded call →
role edit → 401-on-old-token verified end-to-end; role-delete re-auth/bound-user
behavior; lockout after 6 bad logins; import rejects unknown codes atomically.

**Rollback**: additive tables only — revert the branch or drop the new tables; the
resolver rebind reverts to M0's empty-set default.

## Open Questions

1. **Refresh-token rotation** — M1 default: `/auth/refresh` verifies the refresh token,
   checks the session is live, and re-issues an **access** token only (session and refresh
   token unchanged). Confirm whether refresh should rotate the refresh token and add
   reuse-detection before production.
2. **Role-template validation** — `role_template.default_permission_ids` — validate these
   against the catalog at template-create time (M1 default: **yes**, same as import), or
   allow forward-declared codes? Assumed strict validation.
3. **`GET /audit` actor filter semantics** — filter by `actor_user_id` exact match
   (assumed) vs. also matching `actor_role`; and default time window when `from`/`to` are
   omitted (assumed: none, rely on pagination).
