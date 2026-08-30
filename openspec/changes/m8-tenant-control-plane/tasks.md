# M8 — Tenant Control Plane: Tasks

Section-level outline (proposal depth). Each section expands into file-level tasks when
the change is picked up for implementation; M7 (`m7-tenancy-core`) must be merged first.

## 1. Contracts — `packages/contracts/src`

- [ ] 1.1 Extend `enums/tenancy.ts` with `PlanCode` (`WORKSHOP | FACTORY | MULTISITE | SELFHOSTED`), `SupportSessionScope` (`READ_ONLY | FULL`), `TenantExportStatus`; add `TENANT_READ_ONLY` to `enums/error-code.ts` (mapped 403 in the filter)
- [ ] 1.2 Add `SCAN_ONLY_PERMISSIONS` (`["production.scan"] as const`) to `permissions/catalog.ts` as the single source for the seat exemption
- [ ] 1.3 Grow `dto/platform.ts`: `platformContract` — platform auth (login/refresh/logout/me), tenant provisioning + list + lifecycle transitions + purge + export, plan read/update, `tenant_feature` override CRUD, support-session create/list/end; seat-count read endpoint on the tenant-side `iam` router; register on the root contract
- [ ] 1.4 Verify: `pnpm build && pnpm typecheck && pnpm lint`

## 2. DB schema & migration — `packages/db` + `tooling/drizzle/0013_control_plane.sql`

- [ ] 2.1 Add the `schema/platform/` tables **M7 does not already create**: `plan` and `tenant_feature` (PK `(tenant_id, key)`); add `tenant.plan_id` FK + `tenant.extra_seats`. `platform_admin`, `platform_audit_log`, and `support_session` are created by M7's `0012_tenancy.sql` — adopt them, never re-declare them
- [ ] 2.2 Hand-author `0013_control_plane.sql` — it creates only `plan`, `tenant_feature`, and the two `tenant` columns, and MUST NOT re-create M7's control-plane tables. `plan` is `TENANT_EXEMPT` (no `tenant_id`, no RLS) and is appended to M7's `tenancy.parity.spec.ts` allowlist; `tenant_feature` DOES carry `tenant_id` and gets a `tenant_isolation` policy like any business table
- [ ] 2.3 Seed the four `plan` rows (seats 8/20/40/20 + `features` module defaults) and the bootstrap platform admin from env
- [ ] 2.4 Verify: migrate + seed clean on fresh DB; `tenancy.parity.spec.ts` green with the new exempt tables

## 3. Platform principal & auth — `apps/api/src/platform`

- [ ] 3.1 `PlatformAuthService` + `PlatformJwtGuard`: argon2id + lockout parity with tenant login; token claims `{pid, sid}` (never `tid`); mount `/platform/*` only when `DEPLOYMENT_MODE=cloud`
- [ ] 3.2 `platform_audit_log` writer: append-only row for every control-plane mutation (actor, action, target tenant, before/after, correlation id)
- [ ] 3.3 Verify: tenant token rejected on `/platform/*`; platform token rejected on tenant routes; `pnpm build && pnpm typecheck && pnpm lint`

## 4. Provisioning & lifecycle — `apps/api/src/platform`

- [ ] 4.1 `ProvisioningService.provisionTenant` (D1): tenant + domain + per-tenant config seed (`sso_config`, `tax_bracket`, `advance_policy`, `document_template`, `report_schedule`) + first tenant super-admin, one transaction, reusable by M10
- [ ] 4.2 Lifecycle transitions `ACTIVE ↔ READ_ONLY ↔ SUSPENDED → PURGING` with guards (purge requires SUSPENDED + typed confirmation); `TenantStateGuard` (D6) with the named non-GET allowlist and `TENANT_READ_ONLY` 403
- [ ] 4.3 `tenant.export` + `tenant.purge` BullMQ workers (D9): JSONL-per-table archive → presigned URL; reverse-FK purge + `tenants/{tid}/` S3 prefix delete; export exposed to tenant super-admin and allowed in READ_ONLY
- [ ] 4.4 Verify: sweeps skip non-ACTIVE tenants; export completes on a seeded tenant; purge leaves zero rows + zero objects + intact `platform_audit_log`

## 5. Entitlements, seats, flags — `apps/api/src/platform` + hooks in `iam/`

- [ ] 5.1 `EntitlementsService.resolve` (tenant_feature > plan.features > off) cached on `tenantContext`; `assertModuleEnabled(user, code)` called beside `assertPermissions` in module controllers; resolved flags + entitlements added to `GET /auth/me`
- [ ] 5.2 `SeatService` (D3): counted-seat query with `SCAN_ONLY_PERMISSIONS` subset test; `assertCapacity` with tenant-row `FOR UPDATE`; wire into `UserService.create/setRoles/setStatus`, `RoleService.update`, `ImportService` (projected post-edit count, 422 details naming promoted users — D4)
- [ ] 5.3 `tenant_feature` override endpoints (platform admin) + `GET /iam/seats` (tenant-side counts)
- [ ] 5.4 Verify: `pnpm build && pnpm typecheck && pnpm lint`

## 6. Support impersonation — `apps/api/src/platform`

- [ ] 6.1 `SupportSessionService` (D8): create (reason + scope + minutes ≤ cap) → `support_session` row + tenant-scoped access token with `sup` claim, no refresh token; end-early endpoint; `JwtGuard` extension rejecting ended/expired `sup` sessions
- [ ] 6.2 Dual-ledger audit: every request under `sup` writes the support-session id into the tenant `audit_log` row AND `platform_audit_log`; `READ_ONLY` scope routes through the D6 read-only rules
- [ ] 6.3 Verify: impersonated writes attributable in both ledgers; expired token 401s

## 7. Web — `apps/web`

- [ ] 7.1 Platform console route group (cloud mode only): platform login, tenant list + provision, lifecycle actions, feature overrides, support-session start/end with reason field
- [ ] 7.2 Tenant-side surfaces: `TENANT_READ_ONLY` renewal banner (distinct from 403), seat-limit 422 rendering with counts, nav gating by entitlements from `/auth/me`
- [ ] 7.3 Verify: `pnpm build && pnpm typecheck && pnpm lint`

## 8. Tests — acceptance criteria from the delta specs

- [ ] 8.1 Seat math: 8-seat Workshop → 9th counted user 422 with counts in details; scan-only creation unlimited; role edit that would promote exempt users 422 names them; DISABLED frees a seat
- [ ] 8.2 Entitlements: Workshop tenant without `module.hr` → 403 on HR endpoints, nav entry absent; platform override flips it live
- [ ] 8.3 Lifecycle: READ_ONLY tenant — payroll GET 200, report export 200, PDPA export 200, any business POST 403 `TENANT_READ_ONLY`; SUSPENDED login refused with message
- [ ] 8.4 Platform isolation: cross-token rejection both directions; support session dual audit + time-box; purge end-state
- [ ] 8.5 Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root
