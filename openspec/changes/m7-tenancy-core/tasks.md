# M7 — Tenancy Core: Tasks

## 1. Contracts — `packages/contracts/src`

- [ ] 1.1 Add `enums/tenancy.ts` — `TenantKind` (`CUSTOMER | DEMO_TEMPLATE | DEMO_SANDBOX`), `TenantStatus` (`ACTIVE | READ_ONLY | SUSPENDED | PURGING`), `DomainResolutionMode` (`TENANT | DEMO_POOL`) as const objects + types, exported from the enums barrel
- [ ] 1.2 Add `dto/platform.ts` — zod schemas: `PlatformLoginBody`, `PlatformTokenPair`, `TenantCreate` (`{ name, slug, domain? }` — **no** `tenant_id` field anywhere in any DTO), `TenantListItem` (`{ id, name, slug, kind, status, created_at }`), `TenantStatusUpdate` (`{ status, reason }`), `SupportSessionCreate` (`{ tenant_id, reason, minutes }` — control-plane only, the one surface where a tenant id is legitimately an argument), `SupportSessionRow`, `PlatformAuditQuery`/`PlatformAuditRow`
- [ ] 1.3 Build `platformContract = c.router({...}, { pathPrefix: API_PREFIX })` — `POST /platform/auth/login`, `GET /platform/tenants`, `POST /platform/tenants`, `POST /platform/tenants/:id/status`, `POST /platform/support-sessions`, `POST /platform/support-sessions/:id/revoke`, `GET /platform/audit`; every route via `withErrors(...)`, lists via `paginationQuery` + `paginated(item)`
- [ ] 1.4 Add the public pre-login DTO — `TenantContextResponse` (`{ tenant_name, slug, branding }`) and a `GET /public/tenant-context` route (public, host-resolved) on the root contract
- [ ] 1.5 Extend `dto/iam.ts` `MeResponse` with `tenant: { id, name, slug }`; audit every existing DTO to confirm none accepts a `tenant_id` input field (spec: tenant never from request input)
- [ ] 1.6 Register `platform: platformContract` on the root `contract` in `dto/index.ts`; export the new enums/DTO types from the package barrel
- [ ] 1.7 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 2. DB schema — `packages/db/src`

- [ ] 2.1 Add `tenantColumn` to `base-columns.ts` — `{ tenantId: uuid().notNull().default(sql`current_setting('app.tenant_id', true)::uuid`) }` (FK to `tenant.id` declared per-table to avoid a base-columns cycle, same rule as `auditColumns`' `created_by` note)
- [ ] 2.2 Add `schema/platform/tenant.ts` — `tenant` (`slug` citext unique, `name`, `kind` typed `TenantKind`, `status` typed `TenantStatus` default `ACTIVE`, audit + version columns) and `tenant_domain` (`hostname` citext unique, `tenantId` FK, `resolutionMode` typed `DomainResolutionMode`)
- [ ] 2.3 Add `schema/platform/platform-admin.ts` — `platform_admin` (`email` citext unique, `passwordHash`, `status`, `failedLoginCount`, `lockedUntil`, audit + version columns) and `support_session` (`platformAdminId` FK, `tenantId` FK, `reason text NOT NULL`, `expiresAt NOT NULL`, `revokedAt`, `tokenId`)
- [ ] 2.4 Add `schema/platform/platform-audit-log.ts` — `platform_audit_log` mirroring `audit-log.ts` columns plus `platformAdminId` and nullable `tenantId` (control-plane rows survive tenant purge; append-only trigger comes in the migration)
- [ ] 2.5 Add `schema/enums.ts` entries `TenantKind`, `TenantStatus`, `DomainResolutionMode` kept in lockstep with `@erp/contracts` (extend `apps/api/src/enums.parity.spec.ts` imports)
- [ ] 2.6 Spread `...tenantColumn` (+ per-table FK to `tenant.id`) into **every** business table across `schema/{platform,iam,hr,inventory,production,sales,reporting}` — the 44-table list in the proposal plus `stock_movement`, `stock_balance`, `stock_lot`, line tables, and `session`; exempt only `tenant`, `tenant_domain`, `platform_admin`, `platform_audit_log`, `support_session`, `permission`
- [ ] 2.7 Reshape natural-key uniques to composite `(tenantId, …)` in the drizzle definitions: `platform/users.ts` `username`/`email`; `iam/roles.ts` `name`; `iam/role-template.ts` `name`; `inventory/catalog.ts` `uom.code`, `item.code`, `sku.skuCode`, `sku.barcode`; `inventory/ledger.ts` `stock_lot.barcode`; `inventory/documents.ts` both `docNo`s; `hr/employee.ts` `empCode`; `hr/payroll.ts` `period`; `production/work-order.ts` `woNo`; `sales/quotation.ts`, `sales/invoice.ts`, `sales/payment.ts` `docNo`/`certNo`
- [ ] 2.8 Reshape `platform/document-sequence.ts` — PK `(tenantId, key)` via `primaryKey({ columns })`, unique `(tenantId, key, yearScope)` replacing `document_sequence_key_year_scope_uq`
- [ ] 2.9 Reshape `platform/idempotency-key.ts` — PK `(tenantId, key, userId)`; add `tenantId` to `platform/audit-log.ts` (NOT NULL) and `platform/sessions.ts`
- [ ] 2.10 Re-export the new `schema/platform/*` modules from `schema/index.ts`
- [ ] 2.11 Refactor `src/seed/seed.ts` — extract `seedTenantDefaults(db, tenantId)` (document sequences, `tax_bracket`, `sso_config`, `advance_policy`, `document_template`, `ot_rate`, `uom`, base roles, permission-catalog upsert stays global); dev seed = create/find the `DEFAULT_TENANT_SLUG` tenant + `seedTenantDefaults` + super-admin user inside that tenant
- [ ] 2.12 Point `src/migrate.ts` and the seed CLI at `DATABASE_OWNER_URL ?? DATABASE_URL` so migrations/seed run as `erp_owner` while the runtime stays `erp_app`
- [ ] 2.13 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 3. Migration — `tooling/drizzle/0012_tenancy.sql` (hand-authored)

- [ ] 3.1 Write §1: create `tenant`, `tenant_domain`, `platform_admin`, `platform_audit_log`, `support_session`; append-only trigger on `platform_audit_log` (pattern: `0001_audit_append_only.sql`)
- [ ] 3.2 Write §2: insert the default tenant (deterministic uuid, `slug 'default'`, `kind 'CUSTOMER'`, `status 'ACTIVE'`)
- [ ] 3.3 Write §3: for every business table — `ADD COLUMN tenant_id uuid` → `UPDATE SET tenant_id = <default>` → `SET NOT NULL` → FK to `tenant(id)` → `SET DEFAULT current_setting('app.tenant_id', true)::uuid`
- [ ] 3.4 Write §4: constraint swaps — drop/recreate `document_sequence` PK as `(tenant_id, key)` and unique `(tenant_id, key, year_scope)`; `idempotency_key` PK `(tenant_id, key, user_id)`; every task-2.7 natural-key unique recreated as `(tenant_id, …)` by explicit constraint name; add leading-`tenant_id` composite indexes for the hot list predicates
- [ ] 3.5 Write §5: drop + recreate `mv_stock_valuation`, `mv_sales_daily`, `mv_cogs_monthly` with `tenant_id` in the SELECT and in each unique index (so `REFRESH … CONCURRENTLY` still works); create `v_stock_valuation`, `v_sales_daily`, `v_cogs_monthly` as `WITH (security_barrier)` views filtering `tenant_id = current_setting('app.tenant_id', true)::uuid`; create `reporting.refresh_mv(view_name text) SECURITY DEFINER` (owner `erp_owner`) with the three-name allowlist
- [ ] 3.6 Write §6: idempotent `CREATE ROLE erp_owner` / `CREATE ROLE erp_app LOGIN NOBYPASSRLS`; `ALTER TABLE … OWNER TO erp_owner` for all relations; `GRANT SELECT/INSERT/UPDATE/DELETE` on tables and `SELECT` on the `v_*` views to `erp_app`; `REVOKE ALL` on the `mv_*` relations and on `platform_audit_log` writes from `erp_app`
- [ ] 3.7 Write §7 (last): `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation … USING … WITH CHECK …` on every non-exempt table
- [ ] 3.8 Write the companion down script (documented, not journaled) next to the migration notes; verify `pnpm db:generate` produces an **empty** diff after 0012 (drizzle defs and SQL agree)
- [ ] 3.9 Update `infra/docker-compose.yml` Postgres init (create both roles) and `.env.example` (`DATABASE_URL` → `erp_app`, `DATABASE_OWNER_URL` → `erp_owner`); apply 0012 to a seeded dev database and smoke the API against it
- [ ] 3.10 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 4. Tenancy module — `apps/api/src/tenancy`

- [ ] 4.1 `tenant-context.ts` — `TenantStore { tenantId, source: "jwt" | "host" | "job" | "system" }`, `tenantContext` ALS, `currentTenantId()`, `runWithTenant(tenantId, source, fn)`
- [ ] 4.2 Extend `db/unit-of-work.service.ts` — when opening a new transaction, validate `currentTenantId()` is a well-formed uuid and issue `SELECT set_config('app.tenant_id', $1, true)` as the first statement (parameterized, never spliced); no tenant in scope → no GUC (fail-closed under RLS)
- [ ] 4.3 `tenant-transaction.interceptor.ts` — global `TenantTransactionInterceptor` (`APP_INTERCEPTOR` in `app.module.ts`, registered before `IdempotencyInterceptor`): request has `tenantContext` → run the handler inside `uow.withTransaction`; platform/public routes pass through; add an `@SkipTenantTransaction()` opt-out decorator for streaming routes (design OQ1)
- [ ] 4.4 `tenant-resolution.service.ts` + `tenant-resolution.middleware.ts` — `byHostname(host)` over `tenant_domain` (system-scoped read); middleware enters `tenantContext` (`source: "host"`) for `@Public()` routes; in `DEPLOYMENT_MODE=self-hosted` short-circuit to the single tenant
- [ ] 4.5 `with-tenant-job.ts` — `withTenantJob(job, fn)`: validate `job.data.tenantId` uuid, `runWithTenant(tenantId, "job", fn)`; throw a `BusinessRuleError` on missing tenant unless the job name is in `PLATFORM_JOBS`
- [ ] 4.6 `tenant-status.guard.ts` — central `TenantStatus` enforcement: `SUSPENDED`/`PURGING` → 403 on everything (login included), `READ_ONLY` → 403 on mutating methods with error code `TENANT_READ_ONLY` (m8 supplies the billing policy that flips the status)
- [ ] 4.7 `tenancy.parity.spec.ts` (in `apps/api/src`, beside `enums.parity.spec.ts`) — iterate `pgTable`s from the `@erp/db` schema barrel via `getTableConfig`; assert each is in `TENANT_EXEMPT` (`tenant`, `tenant_domain`, `platform_admin`, `platform_audit_log`, `support_session`, `permission`) or has a `tenantId` column; the failure message names the offending table
- [ ] 4.8 `TenancyModule` (global) exporting the context helpers + resolution service; wire the middleware in `main.ts`/`app.module.ts`
- [ ] 4.9 Extend `config/env.schema.ts` — `DEPLOYMENT_MODE` (`cloud|self-hosted`, default `cloud`), `APP_DOMAIN`, `DEFAULT_TENANT_SLUG` (default `default`), optional `DATABASE_OWNER_URL`
- [ ] 4.10 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 5. Auth changes — `apps/api/src/auth` + `apps/api/src/iam`

- [ ] 5.1 `token.service.ts` — `AccessClaims` gains `tid: string` (and optional `sup?: string` for support sessions); `RefreshClaims` gains `tid`
- [ ] 5.2 `jwt.guard.ts` — after `verifyAccess`, `tenantContext.enterWith({ tenantId: claims.tid, source: "jwt" })`; run the `USER_LOOKUP`/`SESSION_LOOKUP` calls inside a short `uow.withTransaction` so RLS applies to auth reads; reject if the session row's `tenantId` ≠ `claims.tid`
- [ ] 5.3 `auth-user.ts` — `AuthUser` gains `tenantId` (and `supportSessionId?`); `@CurrentUser()` consumers unchanged
- [ ] 5.4 `iam/auth.service.ts` — `login` resolves credentials by `(tenant_id, username)` using the host-resolved tenant; lockout counters unchanged in shape (now per-tenant by construction); tokens minted with `tid`; `session` insert carries `tenantId`; `me` returns the tenant block (task 1.5)
- [ ] 5.5 Scope `isSuperAdmin` semantics — no change in `authz.ts` code; update its doc comment to "tenant super-admin: bypasses permission checks within the caller's tenant only" and add a regression test proving a super-admin of tenant A reads zero tenant-B rows
- [ ] 5.6 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 6. Platform module — `apps/api/src/platform`

- [ ] 6.1 `platform-auth.service.ts` + guard — argon2id login for `platform_admin`, separate JWT audience/secret usage so platform tokens never pass `JwtGuard` and tenant tokens never pass the platform guard; lockout mirrors the tenant policy
- [ ] 6.2 `tenant-provisioning.service.ts` — `provision({ name, slug, domain? })`: create `tenant` + optional `tenant_domain` and call `seedTenantDefaults` inside one `uow.withTransaction` run under `runWithTenant(newId, "system", …)`; emit a platform audit row
- [ ] 6.3 `support-session.service.ts` — create (reason required, time-boxed `expires_at`), revoke; mint the tenant-scoped access token with `tid` + `sup`; audit open/close to `platform_audit_log`; the audit subscriber dual-writes `sup`-tagged actions into the tenant's `audit_log`
- [ ] 6.4 `platform-audit.service.ts` — append + cursor-paginated read over `platform_audit_log`
- [ ] 6.5 ts-rest `PlatformController` for `contract.platform`; register `PlatformModule` in `app.module.ts` **only when** `DEPLOYMENT_MODE=cloud`; self-hosted boot instead ensures the single default tenant exists (idempotent, via `TenantProvisioningService`)
- [ ] 6.6 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 7. Infra seams — sequence / storage / realtime / queue / idempotency / audit / mv-refresh

- [ ] 7.1 `sequence/sequence.service.ts` — add `and(eq(documentSequence.tenantId, currentTenantId()), eq(documentSequence.key, key))` to the `FOR UPDATE` select and the update; keep the `next(key)` signature; extend `sequence.spec.ts` with a two-tenant concurrency case (both mint `…-0001`)
- [ ] 7.2 `storage/storage.service.ts` — private `resolveKey(key)` prepending `tenants/${currentTenantId()}/` (throw `BusinessRuleError` outside tenant scope); apply in `put`/`get`/`delete`; `getSignedUrl` verifies the resolved key starts with the caller-tenant prefix before presigning; add a `platformKey()` escape hatch used by no tenant code path
- [ ] 7.3 `realtime/realtime.gateway.ts` — handshake stores `client.data.tenantId = claims.tid`; replace `ROOM_PATTERN` with a `t:{tid}:(timeline|wo:{uuid})` parser; `handleJoin` rejects rooms whose `tid` ≠ `client.data.tenantId`; add `tenantRoom(tenantId, suffix)` helper and migrate all `emitToRoom` call sites (M4 production events, M6 timeline)
- [ ] 7.4 Queue — add `tenantId` to every job-data interface (pdf, email, line, payroll, report, mv-refresh, default); enqueue sites read `currentTenantId()`; wrap every `BaseWorker.handle` body in `withTenantJob`; convert the four sweep schedulers (production monitor, sales overdue, MV fallback, HR probation) to enumerate `tenant WHERE status = 'ACTIVE'` (system-scoped read) and enqueue one job per tenant per tick
- [ ] 7.5 `common/idempotency/idempotency.service.ts` + interceptor — key rows by `(tenantId, key, userId)`; replay lookups include the tenant (RLS enforces; predicate for the PK index)
- [ ] 7.6 `audit/audit.service.ts` + subscriber — populate `auditLog.tenantId` from `currentTenantId()`; dual-write to `platform_audit_log` when `AuthUser.supportSessionId` is set
- [ ] 7.7 `reporting/mv-refresh.ts` + refresh worker — worker calls `reporting.refresh_mv(view)` instead of `REFRESH MATERIALIZED VIEW` directly; debounce map keyed `(tenantId, view)`; repositories switch `mv_*` → `v_*` relation names; fallback sweep refreshes each view once (all tenants' rows in one refresh)
- [ ] 7.8 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 8. Business-module sweep — `apps/api/src/iam`

- [ ] 8.1 Confirm `RolePermissionResolver.resolve` runs inside the guard's tenant transaction (task 5.2) so role joins are tenant-filtered; role/user services rely on RLS + the composite `(tenant_id, name)`/`(tenant_id, username)` uniques (duplicate-name errors now per-tenant)
- [ ] 8.2 Permission catalog stays global (`permission` in `TENANT_EXEMPT`, read-only grant to `erp_app`); `GET /permissions` unaffected; Excel import upserts roles under the caller's tenant only — add an import test with two tenants sharing a role name
- [ ] 8.3 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 9. Business-module sweep — `apps/api/src/hr`

- [ ] 9.1 Audit insert paths (employee, ot_request, cash_advance, payroll run/payslips, salary records) — no explicit `tenantId` needed (column default); remove/adjust any query assuming `emp_code` or `payroll_run.period` global uniqueness
- [ ] 9.2 Probation scan worker consumes the per-tenant job from task 7.4; e-payslip PDFs store under the tenant prefix via task 7.2 automatically — assert the key shape in a test
- [ ] 9.3 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 10. Business-module sweep — `apps/api/src/inventory`

- [ ] 10.1 Audit GR/GI/count/adjustment/BOM paths; SKU auto-issue (`sku_code`) and barcode checks now per-tenant — update any "code exists" precheck to rely on the composite unique's conflict error
- [ ] 10.2 Stock ledger (`stock_movement` append-only, `stock_balance` upserts) inherit tenant via default + RLS; extend the negative-stock and balance tests to a two-tenant fixture proving balances never mix
- [ ] 10.3 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 11. Business-module sweep — `apps/api/src/production`

- [ ] 11.1 Audit work-order/routing/scan paths; `wo_no` sequence + unique now per-tenant; production monitor sweep consumes per-tenant jobs (task 7.4)
- [ ] 11.2 Timeline/work-order socket broadcasts emit via `tenantRoom(...)` (task 7.3); scan-station kiosk tokens carry `tid` like any session
- [ ] 11.3 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 12. Business-module sweep — `apps/api/src/sales`

- [ ] 12.1 Audit quotation/invoice/payment/receipt/WHT paths; all `doc_no`/`cert_no` uniques per-tenant; overdue sweep per-tenant (task 7.4); document templates now per-tenant rows (provisioned by `seedTenantDefaults`)
- [ ] 12.2 PDF renders store under the tenant prefix; PromptPay QR unchanged in M7 (per-tenant `PROMPTPAY_ID` moves to tenant settings in m8 — leave a TODO referencing that change)
- [ ] 12.3 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 13. Business-module sweep — `apps/api/src/reporting`

- [ ] 13.1 Switch all dashboard/report repositories from `mv_*` to the `v_*` security-barrier views; report exports + schedules are per-tenant rows; scheduled digests enqueue with `tenantId`
- [ ] 13.2 Reconciliation check (valuation vs stock cards) now runs per tenant inside the tenant transaction — extend its test to two tenants
- [ ] 13.3 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 14. Web — `apps/web/src`

- [ ] 14.1 Call `GET /public/tenant-context` on the login screen; render tenant name/branding; self-hosted/dev fallback when the endpoint 404s a host
- [ ] 14.2 `session/auth-user-from-me.ts` + `session-context.tsx` — carry `tenant` from `MeResponse`; no `baseHeaders` change (`api/client.ts` — the token already carries `tid`)
- [ ] 14.3 Surface `TENANT_READ_ONLY` (task 4.6) as a persistent banner + disabled-mutation toasts in the error path of the api client
- [ ] 14.4 Verify: `pnpm build && pnpm typecheck && pnpm lint` green

## 15. Tests — the three verification layers + acceptance

- [ ] 15.1 `apps/api/src/tenancy.parity.spec.ts` (task 4.7) green with the final `TENANT_EXEMPT` list; prove it fails by locally adding a tenant-less dummy table, then remove it
- [ ] 15.2 `apps/api/test/integration/tenancy-rls.int.spec.ts` — connect as `erp_app`; assert per non-exempt table: `relrowsecurity`, `relforcerowsecurity`, a `tenant_isolation` policy with `USING` + `WITH CHECK` in `pg_policies`; assert `erp_app` has `NOBYPASSRLS`, no `mv_*` SELECT grant, and that with no GUC set every business table reads empty and inserts fail
- [ ] 15.3 Integration: two-tenant CRUD matrix — same username created in both tenants; invoices numbered `…-0001` in both; idempotency key replay isolated per tenant; audit rows land with the right `tenantId`; support-session request dual-writes both audit logs
- [ ] 15.4 `e2e/tests/tenancy.spec.ts` (TC-TEN-01..n) — provision tenants A and B; as B: every module's list endpoint returns only B rows; direct GET of A's document ids → 404; presign of A's object keys → error; `join` of `t:{A}:wo:{id}` and `t:{A}:timeline` → `{ ok: false }`; login with A's username on B's host → 401
- [ ] 15.5 Integration: sweeps — with tenants A(ACTIVE) + B(SUSPENDED), a scheduler tick enqueues jobs for A only; a hand-enqueued job without `tenantId` fails; `withTenantJob` sets the GUC (job writes carry the right tenant)
- [ ] 15.6 Integration: MV path — event in tenant A dirties `(A, view)` debounce key only; `v_sales_daily` as tenant B excludes A's rows; direct `SELECT * FROM mv_sales_daily` as `erp_app` is denied
- [ ] 15.7 Self-hosted mode boot test — `DEPLOYMENT_MODE=self-hosted`: exactly one tenant exists after boot, `/platform/*` routes are absent (404), any-host login resolves the default tenant
- [ ] 15.8 Cross-tenant concurrency regression — stale `If-Match` against a foreign-tenant id → 404 NOT_FOUND (never 409); replaying tenant A's pagination cursor as tenant B yields only B rows
- [ ] 15.9 Verify: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green from the repo root; apply 0012 to a fresh DB (`pnpm db:migrate && pnpm db:seed`) and re-run `pnpm db:generate` confirming an empty diff
