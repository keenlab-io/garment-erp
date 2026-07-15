# M1 — Access & Identity (IAM): Tasks

## 1. Contracts — `packages/contracts/src`

- [ ] 1.1 Extend `enums/iam.ts` — add `FORCE_LOGOUT` to `AuditAction` (const object + type); keep `UserStatus` as-is (`PENDING | ACTIVE | DISABLED`)
- [ ] 1.2 Add `dto/iam.ts` — zod schemas: `LoginBody`, `RefreshBody`, `TokenPair` (`{ access_token, refresh_token, expires_in }`), `MeResponse` (`{ user, roles, permissions[] }`), `RoleCreate`/`RoleUpdate`/`RoleClone`/`RoleDelete` (`{ super_admin_password }`), `RoleListItem` (`{ id, name, permission_count, user_count }`), `PermissionCode` (reuse `Permission`), `RoleTemplateCreate`, `UserCreate`/`UserRolesUpdate`/`UserStatusUpdate`, `UserListItem` (no `password_hash`), `AuditQuery` (filters), `AuditRow`, `ImportResult` (`{ imported, skipped[] }`)
- [ ] 1.3 Build `iamContract = c.router({...}, { pathPrefix: API_PREFIX })` — auth (login/refresh/logout/me), roles (`GET`/`POST`/`PUT`/`clone`/`DELETE`), `GET /permissions`, `POST /role-templates`, users (`GET`/`POST`/`PUT roles`/`force-logout`/`status`), `POST /iam/import` (multipart), `GET /audit`; every route via `withErrors(...)`, list routes via `paginationQuery` + `paginated(item)`
- [ ] 1.4 Register `iam: iamContract` on the root `contract` in `dto/index.ts`; export new DTO types from the package barrel
- [ ] 1.5 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. DB schema — `packages/db/src`

- [ ] 2.1 Add `FORCE_LOGOUT` to `AuditAction` in `schema/enums.ts` (keep the `expectTypeOf` parity test green)
- [x] 2.2 Add `schema/iam/roles.ts` — `role` (`name` unique, `description`, `is_system` default false, `cloned_from` self-FK, audit + `version` columns)
- [x] 2.3 Add `schema/iam/permissions.ts` — `permission` (`code` text unique); `role_permission` (PK `(role_id, permission_id)`, both FKs `ON DELETE CASCADE`)
- [x] 2.4 Add `schema/iam/user-role.ts` — `user_role` (PK `(user_id, role_id)`, `user_id` FK `ON DELETE CASCADE`, `role_id` FK)
- [x] 2.5 Add `schema/iam/role-template.ts` — `role_template` (`name` unique, `default_permission_ids uuid[]` default `{}`)
- [x] 2.6 Add nullable `employeeId uuid` column to `platform/users.ts` **without** an FK constraint (FK to `employee(id)` deferred to M2)
- [x] 2.7 Re-export the new `schema/iam/*` modules from `schema/index.ts`
- [x] 2.8 `pnpm db:generate` (rebuild dist first) and review the migration; confirm `pnpm db:generate` is clean on re-run
- [x] 2.9 Extend `src/seed/seed.ts` — upsert one `permission` row per `@erp/contracts` `PERMISSIONS` code (`onConflictDoNothing` on `code`)
- [x] 2.10 Run `pnpm db:migrate && pnpm db:seed` against dev Postgres; confirm tables + seeded catalog exist

## 3. Nest module — `apps/api/src/iam`

- [ ] 3.1 Add `exceljs` to `apps/api` runtime deps
- [ ] 3.2 `RolePermissionResolver` — implements `PermissionResolver`; `resolve(userId)` returns the role→permission union via `currentExecutor(db)`; provide it for `PERMISSION_RESOLVER` in `IamModule`
- [ ] 3.3 `AuthService` — `login` (verify argon2id, lockout enforcement, create session, issue tokens, reset counter, emit `UserLoggedIn`), `refresh` (re-issue access token if session live), `logout` (set `session.revokedAt`), `me` (user + roles + effective permissions)
- [ ] 3.4 Lockout logic in `login` — increment `failed_login_count` on bad password; `>= 5` → `locked_until = now()+15m`; refuse while locked even with correct password; reset on success
- [ ] 3.5 `RoleService` — `create`/`list` (with counts), `update` (replace `role_permission`; bump `permissions_version` for every bound user), `clone` (deep-copy + `cloned_from`), `delete` (verify `super_admin_password` vs caller → `ReauthRequiredError`; 409 if users bound; block `is_system`); emit `PermissionsChanged`/`RoleDeleted` with an `audit` block (`PERMISSION_CHANGE`)
- [ ] 3.6 `PermissionService`/catalog + `GET /permissions`; `role-templates` create with catalog validation
- [ ] 3.7 `UserService` — `list` (paginated via `buildPage`, status filter, no hash), `create` (hash temp password, assign roles), `setRoles` (replace `user_role` + bump version), `forceLogout` (bump version + revoke all sessions, emit `PermissionsChanged`/`SessionRevoked`, audit `FORCE_LOGOUT`), `setStatus`
- [ ] 3.8 `ImportService` — parse Excel with `exceljs`; validate every code against `permission.code`; unknown → 400 with offending rows; upsert roles + replace `role_permission` all-or-nothing in `uow.withTransaction`; bump affected users' versions; return `{ imported, skipped[] }`
- [ ] 3.9 `AuditService` read path / `AuditQueryService` + `GET /audit` — filters (`entity_type`/`entity_id`/`actor`/`from`/`to`), cursor pagination, newest first
- [ ] 3.10 ts-rest `IamController` — `@TsRestHandler(contract.iam)`; `@Public()` only where login/refresh need it (split controllers or class-level `@Public` on a public auth controller); all other handlers call `assertPermissions(user, "iam.…")`; wrap mutations in `uow.withTransaction`
- [ ] 3.11 `IamModule` — declares services + controller(s), rebinds `PERMISSION_RESOLVER`; add to `app.module.ts` imports/controllers
- [ ] 3.12 Verify: `pnpm build && pnpm typecheck && pnpm lint` green; API boots and maps the new `/api/v1/auth|roles|users|permissions|iam|audit` routes

## 4. Tests (spec §1.8 acceptance criteria)

- [ ] 4.1 Changing an online user's roles ⇒ their next request returns 401 (pv mismatch) until re-login
- [ ] 4.2 `DELETE /roles/{id}` without a valid `super_admin_password` ⇒ 403, no data change, no audit `DELETE`/`PERMISSION_CHANGE` row written
- [ ] 4.3 Deleting a role still bound to ≥1 user ⇒ 409; `is_system` role ⇒ not deletable
- [ ] 4.4 Every authz mutation writes exactly one `PERMISSION_CHANGE` (or `FORCE_LOGOUT`) audit row with actor + before/after + timestamp
- [ ] 4.5 6 consecutive bad logins ⇒ 15-min lock; correct password during lock ⇒ still refused; success resets the counter
- [ ] 4.6 Import with an unknown permission code ⇒ 400 listing offending rows, nothing persisted (transaction rolls back); valid import creates/updates roles
- [ ] 4.7 `RolePermissionResolver` returns the correct union; user with no roles ⇒ empty set ⇒ 403 on guarded routes; super-admin bypass unaffected

## 5. Verification

- [ ] 5.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
- [ ] 5.2 `pnpm db:generate` produces no diff after migration; `pnpm db:migrate && pnpm db:seed` run cleanly against a fresh DB
- [ ] 5.3 Boot `pnpm dev` and drive end-to-end: login → authenticated `GET /auth/me` → a guarded call succeeds with the right permission and 403 without → edit the caller's role → the old token now returns 401
- [ ] 5.4 Confirm force-logout revokes all of a user's sessions and the old tokens return 401
