# M7 — Tenancy Core (Multi-Tenant SaaS Conversion)

## Why

The ERP is a single-tenant system: one `user` table with globally unique usernames, one
global invoice counter in `document_sequence`, one flat S3 keyspace, guessable Socket.IO
rooms (`wo:{id}`), and materialized views that aggregate every row in the database. The
go-to-market plan (`docs/Garment_ERP_Go_To_Market_Plain_Language.md`) sells this product
as hosted SaaS at three price tiers plus a ฿550,000 self-hosted package — which requires
hard tenant isolation, a control plane that can provision tenants, and one codebase that
runs in both deployment modes without a fork.

M7 is the isolation core the later commercial changes (m8 plans/billing, m9 control-plane
surface, m10 demo sandboxes) build on. It adds `tenant_id` to every business table,
enforces isolation with Postgres Row-Level Security (application `WHERE` clauses are
defence-in-depth, never the primary control), threads a tenant context through every M0
infrastructure seam (`UnitOfWork`, `SequenceService`, `StorageService`,
`RealtimeGateway`, BullMQ, idempotency, audit, MV refresh), splits today's global
`isSuperAdmin` into a tenant-scoped super-admin and a separate platform-admin principal,
and ships the structural tests that keep the guarantee true as future modules add tables.

## What Changes

- **Row-Level Security on all 44+ business tables**: `tenant_id uuid NOT NULL` everywhere,
  `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, one `tenant_isolation` policy
  per table (`USING`/`WITH CHECK` on the `app.tenant_id` GUC), and a two-role split —
  `erp_owner` owns objects and runs migrations, `erp_app` is the runtime role with
  `NOBYPASSRLS`. Owners and superusers silently bypass RLS, so the split is load-bearing.
- **Tenant context plumbing** in a new `apps/api/src/tenancy/` module: a `tenantContext`
  ALS (separate from `txContext`) with `currentTenantId()`, `SET LOCAL app.tenant_id` as
  the first statement of every `UnitOfWork.withTransaction`, and a global
  `TenantTransactionInterceptor` that wraps every authenticated request in a transaction
  so reads never fall through to the un-scoped pool.
- **Tenant identity**: access-token claims become `{ sub, sid, pv, tid }`; `session`
  gains `tenant_id`; hostname (via a `tenant_domain` table) resolves the tenant pre-login
  only; after login the `tid` claim is authoritative. `tenant_id` is never accepted from
  a request body, query param, or header.
- **The super-admin split**: `user.isSuperAdmin` becomes a *tenant* super-admin (bypasses
  permissions inside their own tenant only). A new `platform_admin` principal with its own
  login surface (`apps/api/src/platform/`) provisions tenants and may enter one only via
  an explicit, time-boxed, reason-tagged, fully audited `support_session`.
- **Every known single-tenant seam fixed**: per-tenant document sequences
  (PK `(tenant_id, key)`), per-tenant unique `username`/`email` (and every other
  natural-key unique: doc numbers, item/SKU codes, `emp_code`, `payroll_run.period`,
  role names, barcodes), MV isolation via `security_barrier` wrapper views (Postgres
  cannot put RLS on a matview), tenant-prefixed S3 keys (`tenants/{tid}/`), tenant-bound
  socket rooms (`t:{tid}:wo:{id}`), `tenantId` in every BullMQ payload with a
  `withTenantJob` worker wrapper, per-tenant sweep fan-out for the four global jobs,
  idempotency keys scoped `(tenant_id, key, user_id)`, tenant-tagged `audit_log` plus a
  separate `platform_audit_log`, and per-tenant rows for the former singleton config
  tables (`sso_config`, `tax_bracket`, `advance_policy`, `document_template`,
  `report_schedule`).
- **One hand-authored migration** `tooling/drizzle/0012_tenancy.sql`: columns, backfill
  of all existing rows to a default tenant, constraint swaps, roles/grants, policies, and
  the MV rebuild — drizzle-kit cannot generate any of that.
- **Self-hosted parity**: `DEPLOYMENT_MODE=cloud|self-hosted`. Self-hosted seeds exactly
  one tenant, disables the control plane, and skips hostname resolution — one build.
- **Verification as a headline deliverable**: a build-failing static parity test
  (`tenancy.parity.spec.ts` — every schema table has `tenantId` or is in an explicit
  `TENANT_EXEMPT` allowlist), a `pg_policies` integration test (RLS enabled + forced +
  policy present on every non-exempt table), and a cross-tenant Playwright suite
  (`e2e/tests/tenancy.spec.ts`) that attacks every list endpoint, document id, presigned
  URL, and socket room across the tenant boundary.

Out of scope (later changes): plans, seat caps, entitlements, and the platform console
and support-session management surface (`plan`, `tenant_feature` — m8); subscriptions and
offline billing (`subscription`, `subscription_invoice` — m9); Google OIDC,
`auth_identity`, and demo sandboxes (m10). Note that m7 *creates* `platform_admin`,
`platform_audit_log`, and `support_session` — it needs them for the super-admin split and
the support-session audit seam — while m8 owns the surface that manages them.

## Capabilities

### New Capabilities

- `tenant-isolation`: `tenant_id` + forced RLS on every business table via the
  `app.tenant_id` GUC and the `tenant_isolation` policy; the `erp_owner`/`erp_app` role
  split; the `tenantContext` ALS and `TenantTransactionInterceptor`; the hard rule that
  `tenant_id` never comes from request input; and the three verification deliverables
  (static parity test, `pg_policies` integration test, cross-tenant Playwright suite).
- `tenant-resolution`: the `tenant` and `tenant_domain` tables, hostname→tenant
  resolution pre-login (branding, per-tenant lockout, IdP choice), `tid`-claim authority
  after login, tenant lifecycle statuses (`ACTIVE | READ_ONLY | SUSPENDED | PURGING`)
  with central enforcement, and `DEPLOYMENT_MODE` self-hosted behavior.
- `tenant-scoped-infrastructure`: tenant propagation beyond the HTTP request — the
  `withTenantJob` BullMQ wrapper, per-tenant fan-out of the four repeatable sweeps,
  tenant-prefixed S3 keys, tenant-bound socket rooms, tenant-aware MV-refresh debounce
  keys, and per-tenant provisioning defaults for the former singleton config rows.

### Modified Capabilities

- `authentication`: `tid` in access claims, `tenant_id` on `session`, login lookup by
  `(tenant_id, username)` on the host-resolved tenant, per-tenant lockout.
- `authorization`: `isSuperAdmin` becomes tenant-scoped; new `platform_admin` principal
  and audited, time-boxed `support_session` impersonation.
- `persistence`: shared `tenantColumn` convention in `base-columns.ts`, per-tenant unique
  constraints, runtime connection as `erp_app`, hand-authored migration precedent.
- `document-sequencing`: `document_sequence` PK → `(tenant_id, key)`;
  `SequenceService.next` locks the caller-tenant's row only.
- `object-storage`: `StorageService` enforces the `tenants/{tid}/` key prefix on every
  operation and verifies it before presigning.
- `background-queue`: every job payload carries `tenantId`; workers restore tenant
  context (ALS + GUC) before touching the database.
- `realtime-gateway`: handshake binds the socket to its token's tenant; rooms become
  `t:{tid}:…`; join validation rejects foreign-tenant rooms.
- `materialized-views`: MVs gain `tenant_id` and are exposed only through
  `security_barrier` views filtering on the GUC.
- `mv-refresh`: refresh executes with `erp_owner` rights (SECURITY DEFINER function);
  debounce keys become `(tenant, view)`.
- `idempotency`: records keyed `(tenant_id, key, user_id)`.
- `audit-log`: `audit_log.tenant_id` + the separate append-only `platform_audit_log`.
- `optimistic-concurrency`: cross-tenant `If-Match` probes surface as 404, never 409.
- `cursor-pagination`: a cursor is not a capability — replaying another tenant's cursor
  discloses nothing.

## Impact

- **Packages**
  - `@erp/contracts` — new `enums/tenancy.ts` (`TenantKind`, `TenantStatus`,
    `DomainResolutionMode`) and `dto/platform.ts` (`platformContract`: platform-admin
    auth, tenant provisioning/status, support sessions) registered on the root
    `contract`; a public tenant-context DTO for pre-login branding; `MeResponse` gains
    the tenant. No change to money/qty.
  - `@erp/db` — `tenantColumn` in `base-columns.ts`; `tenantId` on all business tables;
    new `schema/platform/` tables `tenant`, `tenant_domain`, `platform_admin`,
    `platform_audit_log`, `support_session`; unique/PK reshapes; enums file extended;
    seed grows a `seedTenantDefaults(tenantId)` used by provisioning, the self-hosted
    boot, and the dev seed.
  - `apps/api` — new `tenancy/` and `platform/` modules; `UnitOfWork`, `JwtGuard`,
    `TokenService` claims, `SequenceService`, `StorageService`, `RealtimeGateway`,
    queue workers/sweeps, `IdempotencyService`, `AuditService`, `mv-refresh` all
    tenant-threaded; env gains `DEPLOYMENT_MODE`, `APP_DOMAIN`, `DEFAULT_TENANT_SLUG`
    (and an optional `DATABASE_OWNER_URL` for migrate/seed).
  - `apps/web` — pre-login tenant branding from the public resolve endpoint; session
    carries the tenant from `/auth/me`; no per-screen changes (isolation is server-side).
- **Infra** — `tooling/drizzle/0012_tenancy.sql` (hand-authored); dev Postgres init
  creates `erp_owner`/`erp_app`; `infra/docker-compose.yml` + `.env.example` updated so
  the runtime connects as `erp_app` (a superuser connection would silently bypass RLS).
- **Downstream** — m8 attaches `plan`/`subscription`/seat caps to the `tenant` row; m9
  builds the console on `platformContract`; m10 provisions `DEMO_SANDBOX` tenants through
  the same `TenantProvisioningService`. The parity test forces every future table to
  declare its tenancy posture at compile time.
