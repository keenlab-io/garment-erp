# M7 — Tenancy Core: Design

## Context

Every write in `apps/api` already flows through two seams M0 built: `UnitOfWork.withTransaction`
(`apps/api/src/db/unit-of-work.service.ts`) opens a drizzle transaction and publishes it into the
`txContext` ALS (`apps/api/src/db/tx-context.ts`), and `currentExecutor(db)` returns *the active tx,
or the raw pool when outside one*. Reads outside a transaction — most `GET` handlers — hit the raw
pool. Authentication is the global `JwtGuard` (`apps/api/src/auth/jwt.guard.ts`) verifying access
claims `{ sub, sid, pv }` (`TokenService`, `apps/api/src/auth/token.service.ts`), loading user +
session through the `USER_LOOKUP`/`SESSION_LOOKUP` seams, and attaching an `AuthUser`
(`apps/api/src/auth/auth-user.ts`) whose `isSuperAdmin` bypasses every permission check in
`assertPermissions` (`apps/api/src/auth/authz.ts`).

Everything below threads one new fact — *which tenant is acting* — through those seams without
rebuilding them, and makes the database itself refuse to answer for any other tenant. The
single-tenant assumptions that must break are concrete and enumerable: `document_sequence.key` is a
global PK (`packages/db/src/schema/platform/document-sequence.ts`), `user.username`/`email` are
globally unique citext (`platform/users.ts`), the three M6 matviews aggregate all rows
(`tooling/drizzle/0011_reporting_materialized_views.sql`) and Postgres cannot attach RLS to a
matview, `idempotency_key`'s PK is `(key, user_id)`, S3 keys are flat (`storage/storage.service.ts`),
socket rooms are `wo:{uuid}` (`realtime/realtime.gateway.ts` `ROOM_PATTERN`), and four repeatable
jobs sweep the whole database (`PRODUCTION_MONITOR_INTERVAL_MS`, `SALES_OVERDUE_SWEEP_MS`,
`MV_REFRESH_FALLBACK_MS`, `PROBATION_ALERT_DAYS` in `config/env.schema.ts`).

The template for "structural guarantee enforced by a build-failing test" is
`apps/api/src/enums.parity.spec.ts` / `permissions.parity.spec.ts`; M7 copies that pattern for
tenancy itself.

## Goals / Non-Goals

**Goals:**

- Cross-tenant reads and writes are impossible *at the database*, not merely unlikely in the
  application — RLS with a forced policy on every business table, runtime role `erp_app`.
- Zero-per-module rewrite: existing services keep calling `currentExecutor(db)`; tenancy arrives via
  the transaction boundary, a GUC, and column defaults — not via editing every query.
- Tenant identity is cryptographic after login (`tid` claim), never inferable from request input.
- The global super-admin bypass becomes tenant-scoped; platform operations get their own principal,
  login surface, and audit trail, with impersonation only through explicit support sessions.
- Every infra key space (document numbers, usernames, S3 keys, socket rooms, queue payloads,
  idempotency keys, MV rows, debounce keys) is tenant-namespaced.
- One migration converts the existing single-tenant database losslessly into tenant #1.
- One build serves cloud and self-hosted (`DEPLOYMENT_MODE`), protecting the ฿550k self-hosted SKU.
- The guarantee is *kept* true by structural tests, not by review discipline.

**Non-Goals:**

- **No plans, seat caps, entitlements, or billing** — `plan`, `subscription`,
  `subscription_invoice`, `tenant_feature`, READ_ONLY-on-expiry *policy* are m8. M7 ships the
  `tenant.status` enum and its central *enforcement mechanism* only.
- **No platform console UI** — m9. M7 ships the `platformContract` API surface it will consume.
- **No OIDC / `auth_identity` / Google login / demo sandboxes** — m10. Hostname resolution is built
  so the demo pool host is just another `tenant_domain` row (`resolution_mode = DEMO_POOL`), but
  nothing consumes that mode yet.
- **No per-tenant encryption keys** — `ENCRYPTION_KEY` stays instance-wide (Open Question 4).
- **No sharding / per-tenant databases** — single database, shared schema, RLS.

## Decisions

### D1. Postgres Row-Level Security is the primary control; application filtering is defence-in-depth

Every business table gains `tenant_id uuid NOT NULL` and a policy named `tenant_isolation`:

```sql
ALTER TABLE t ENABLE ROW LEVEL SECURITY;
ALTER TABLE t FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON t
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

With the GUC unset, `current_setting(…, true)` returns NULL and the policy evaluates to NULL —
no rows visible, no rows insertable. Every `tenant_id` column also gets
`DEFAULT current_setting('app.tenant_id', true)::uuid`, so existing insert paths need no code
change: the row inherits the ambient tenant and `WITH CHECK` verifies it. Repositories MAY add
explicit `tenant_id` predicates for index selectivity, but correctness never depends on them.

*Rejected alternative:* application-level `WHERE tenant_id = ?` as the primary control (the common
"add a scoped repository base class" approach). Rejected because one forgotten predicate — in a
report join, an event handler, a raw `sql` fragment, an M8+ feature written in a hurry — is a
silent cross-tenant leak, and the codebase already has ~44 tables and six modules of query surface.
RLS turns that entire class of bug into "returns zero rows", which tests catch instantly. The cost
(planner overhead per query, one GUC to manage) is bounded and measured once, not re-paid per
feature.

### D2. Two Postgres roles: `erp_owner` owns, `erp_app` runs — the split is load-bearing

Postgres **silently disables RLS for the table owner and for superusers** unless
`FORCE ROW LEVEL SECURITY` is set — and even FORCE is bypassed by roles with `BYPASSRLS` and by
superusers. Today dev and prod connect as a single privileged role; under that role every policy in
D1 would be decorative. Therefore:

- `erp_owner`: owns all tables, views, and functions; runs migrations (`packages/db/src/migrate.ts`)
  and seeds; is never used by the API at runtime.
- `erp_app`: `LOGIN NOBYPASSRLS`, **not** the owner, granted table-level
  `SELECT/INSERT/UPDATE/DELETE` and sequence usage — the role in the runtime `DATABASE_URL` that
  `createDb` (`packages/db/src/client.ts`) connects with.

`FORCE ROW LEVEL SECURITY` is still applied to every table as belt-and-braces (it protects against
a misconfigured deployment where the app accidentally connects as the owner), and the `pg_policies`
integration test (D16) asserts both flags. The dev compose init script and `.env.example` are
updated so *development also runs as `erp_app`* — otherwise local work would never exercise the
policies and CI would be testing a different database than production.

*Rejected alternative:* one role plus `ENABLE ROW LEVEL SECURITY` only. Rejected because the owner
bypass makes every policy a no-op for the only role that exists — the system would pass every
functional test while providing zero isolation. This is the classic RLS deployment failure and the
reason the role split is called out as load-bearing rather than an ops nicety.

### D3. A global `TenantTransactionInterceptor` wraps every authenticated request in a transaction

`SET LOCAL app.tenant_id = $tid` only lives inside a transaction. `currentExecutor(db)`
(`apps/api/src/db/tx-context.ts:22`) falls through to the raw pool outside one — which is exactly
where most `GET` handlers run today. On the pool, a session-level `SET` would leak across pooled
connections serving other tenants; `SET LOCAL` is impossible. So M7 registers a global
`TenantTransactionInterceptor` (`apps/api/src/tenancy/tenant-transaction.interceptor.ts`, bound via
`APP_INTERCEPTOR` in `app.module.ts` ahead of `IdempotencyInterceptor`) that, for every request with
a resolved tenant, invokes the handler inside `UnitOfWork.withTransaction`. Nested
`withTransaction` calls already join the ambient transaction (`unit-of-work.service.ts:19-20`), so
existing service code is unchanged; `onCommit` hooks and after-commit event dispatch keep their M0
semantics. `UnitOfWork.withTransaction` itself issues `SET LOCAL app.tenant_id` (from
`currentTenantId()`, D4) as the first statement of every transaction it opens, so background jobs
and non-HTTP callers get the same treatment without the interceptor.

Nest ordering caveat, made explicit because it shapes D4: **guards run before interceptors**, so
the `JwtGuard`'s own `USER_LOOKUP`/`SESSION_LOOKUP` queries cannot ride the interceptor's
transaction. The guard establishes `tenantContext` from the verified `tid` claim first and then
performs its lookups inside a short `withTransaction` of their own (two transactions per request:
one tiny one for auth, one for the handler). Public routes (login, health, tenant resolve) have no
tenant yet; the hostname middleware (D5) supplies context for login, and health touches no
tenant-scoped table.

*Rejected alternative:* per-request connection pinning via postgres.js `reserve()` — reserve a
connection at the start of the request, `SET app.tenant_id` on it, release at the end. It avoids
wrapping cheap reads in transactions, but it pins one physical connection per in-flight request for
the request's full duration, so slow handlers (PDF rendering, report exports) exhaust
`DB_POOL_MAX` (default 10) under modest concurrency, and it bypasses the `txContext` machinery that
every service already routes through — `currentExecutor` would need a parallel "reserved
connection" branch and `onCommit` semantics get murky. A read-only transaction per GET is cheap in
Postgres (no WAL, snapshot only); pool exhaustion under load is not. Both options were weighed; the
interceptor wins on safety and on not forking the executor model.

### D4. `tenantContext` is a second ALS, deliberately separate from `txContext`

New file `apps/api/src/tenancy/tenant-context.ts`:

```ts
export interface TenantStore { tenantId: string; source: "jwt" | "host" | "job" | "system"; }
export const tenantContext = new AsyncLocalStorage<TenantStore>();
export const currentTenantId = (): string | null => tenantContext.getStore()?.tenantId ?? null;
```

`UnitOfWork.withTransaction` reads `currentTenantId()` and emits the `SET LOCAL` when (and only
when) a tenant is in scope. The two stores stay separate because their lifetimes differ: tenant
scope **outlives any single transaction** — one BullMQ job or socket handler runs many
transactions under one tenant, and the auth-lookup transaction (D3) commits long before the handler
transaction begins. Folding `tenantId` into `TxStore` would force every non-HTTP entry point to
open a transaction just to declare its tenant, and would lose the tenant between the two
transactions of a single request. Entry points establish the store: `JwtGuard` (from `tid`),
`TenantResolutionMiddleware` (from hostname, pre-login), `withTenantJob` (from the job payload,
D11), `RealtimeGateway` (from the socket handshake, D12).

*Rejected alternative:* extending `TxStore` with `tenantId`. Rejected for the lifetime mismatch
above, and because `txContext` is M0 code with a single crisp meaning ("the ambient transaction")
that six modules already rely on — overloading it couples tenancy to transaction shape.

### D5. Hostname resolves the tenant pre-login only; after login the `tid` claim is authoritative; `tenant_id` never comes from request input

Pre-login, the only honest signal is the host the browser connected to. A `tenant_domain` table
(`hostname citext UNIQUE`, `tenant_id` FK, `resolution_mode TENANT | DEMO_POOL`) maps hostnames to
tenants; `TenantResolutionService.byHostname(host)` backs a public
`GET /public/tenant-context` (branding, tenant display name, later: IdP choice) and gives the login
handler its tenant for the `(tenant_id, username)` credential lookup and per-tenant lockout
counters. A dedicated *table* — not subdomain string-parsing of `APP_DOMAIN` — because the demo
pool host (`garment-erp-demo.keenlab.io`, m10) is not a subdomain of the app domain at all, and a
paying factory will eventually want `erp.theirfactory.co.th`; one mechanism serves subdomains,
vanity domains, and the demo pool.

After login, the `tid` claim in the access token is the sole source of tenant identity. The `Host`
header is trivially forgeable by any API client, so it is **never** consulted on authenticated
requests (at most, a mismatch between token `tid` and the host's resolved tenant is logged as an
anomaly). And as a hard rule with its own requirement: **`tenant_id` is never accepted from a
request body, query parameter, or header** — no DTO in `@erp/contracts` carries it, and the
`TenantTransactionInterceptor` sources it exclusively from `tenantContext`.

*Rejected alternative:* host-header-authoritative on every request (common in subdomain-routed
SaaS). Rejected because it makes tenant identity spoofable by anything that can set a header, and
it breaks non-browser clients (mobile, integrations) that hold a token but not a hostname
relationship. The claim is signed; the header is not.

### D6. The super-admin split: tenant super-admin vs. `platform_admin`

`user.isSuperAdmin` today bypasses every permission check globally (`authz.ts:15`,
`jwt.guard.ts:73`). Under RLS its blast radius is already fenced to one tenant's rows — M7 makes
the *semantics* match: it is renamed in meaning (not in column) to **tenant super-admin**, bypassing
`assertPermissions` within the caller's own tenant only. Because every guard lookup and every query
runs under `app.tenant_id = token.tid`, no code change is needed in `authz.ts` for the fence — the
change is documentation, spec, and the removal of any implicit "sees everything" expectation.

Platform operations get a separate principal: `platform_admin` (own table, own argon2id credentials,
own login surface under `apps/api/src/platform/`, own token audience so a platform token never
passes `JwtGuard` and a tenant token never passes the platform guard). A platform admin **cannot
read tenant data** through the ordinary API. To assist a customer they open a `support_session`:
`{ platform_admin_id, tenant_id, reason NOT NULL, expires_at NOT NULL, revoked_at }` — creating it
writes `platform_audit_log`, and it mints a time-boxed tenant-scoped access token whose claims carry
`tid` plus a `sup` claim (the support-session id). Every request made under `sup` is audited into
*both* the tenant's `audit_log` (so the customer can see support touched their data) and
`platform_audit_log`. Expiry or revocation kills the token via the ordinary session checks.

*Rejected alternatives:* (a) keeping one global super-admin — under multi-tenancy that is a
standing cross-tenant backdoor and would require punching a hole in RLS for ordinary API traffic;
(b) modelling platform admins as `user` rows in a "platform tenant" — rejected because `user` is
tenant-scoped by D1's parity rules, the two principals have disjoint lifecycles and login surfaces,
and mixing them makes the "platform tokens never pass JwtGuard" property impossible to state.

### D7. A separate `platform_audit_log`, not nullable-tenant rows in `audit_log`

`audit_log` gains `tenant_id NOT NULL` and falls under RLS like any business table — a tenant's
audit trail is the tenant's data. Control-plane actions (tenant provisioned, status changed,
support session opened/closed, platform-admin login) have no tenant row to hide behind and must
survive tenant purges, so they go to a new append-only `platform_audit_log` (same
BEFORE UPDATE/DELETE trigger pattern as `tooling/drizzle/0001_audit_append_only.sql`), exempt from
the tenant parity allowlist and readable only via the platform surface.

*Rejected alternative:* `audit_log.tenant_id` nullable with NULL meaning "platform". Rejected
because a nullable tenant column would need a policy carve-out (`tenant_id IS NULL OR …`) on the
single most sensitive table, RLS `USING` would expose platform rows to every tenant or none, and
purge semantics conflict (tenant audit rows purge with the tenant; platform rows must not).

### D8. Materialized views: `tenant_id` column + `security_barrier` wrapper views; refresh runs with owner rights

**Postgres does not support RLS on materialized views** — `ALTER MATERIALIZED VIEW … ENABLE ROW
LEVEL SECURITY` is not a thing. The three M6 MVs (`mv_stock_valuation`, `mv_sales_daily`,
`mv_cogs_monthly`; `apps/api/src/reporting/mv-refresh.ts` `MV`) are therefore rebuilt in
`0012_tenancy.sql` to carry `tenant_id` (added to the SELECT and to each unique index so
`REFRESH … CONCURRENTLY` still works), **revoked from `erp_app` entirely**, and exposed through one
`security_barrier` view each — `v_stock_valuation`, `v_sales_daily`, `v_cogs_monthly`:

```sql
CREATE VIEW v_sales_daily WITH (security_barrier) AS
  SELECT … FROM mv_sales_daily
  WHERE tenant_id = current_setting('app.tenant_id', true)::uuid;
GRANT SELECT ON v_sales_daily TO erp_app;
```

`security_barrier` prevents leaky-function pushdown from peeking past the filter. Reporting
repositories query the `v_*` views, never the `mv_*` relations — enforced by grant (a direct MV
query as `erp_app` errors) and by lint-greppable naming. Because the MVs source from RLS-forced
tables, the refresh itself must not run as `erp_app` (it would materialize an empty view — the
refresh session has no `app.tenant_id`) and `REFRESH MATERIALIZED VIEW` requires ownership anyway.
The migration ships `reporting.refresh_mv(view_name text)` as a `SECURITY DEFINER` function owned
by `erp_owner` with a hard-coded allowlist of the three MV names; the `mv-refresh` worker calls it.
The debounce key in the refresh scheduler becomes `(tenantId, view)` so tenant A's invoice burst
cannot starve or batch away tenant B's refresh (payload change in D11's scheme); the fallback sweep
refreshes each view once globally (the MV holds all tenants' rows).

*Rejected alternatives:* (a) one MV per tenant (`mv_sales_daily_{tid}`) — unbounded DDL at
provisioning time, unmanageable refresh fan-out, drizzle cannot model dynamic relations;
(b) demoting the MVs to plain views over RLS tables — correct but forfeits the M6 performance
contract the dashboards were built on (`materialized-views` spec: valuation reconciles to stock
cards at interactive latency); (c) a second owner-credential connection pool in the worker just for
refresh — a whole privileged pool to run three statements; the SECURITY DEFINER function grants
exactly the needed capability and nothing else.

### D9. Per-tenant document sequences: PK `(tenant_id, key)`

`document_sequence` (`packages/db/src/schema/platform/document-sequence.ts`) has PK `key` — one
global counter, so tenant B's first invoice would be `INV-2026-0007` because tenant A issued six.
The PK becomes `(tenant_id, key)`, the yearly-scope unique becomes
`(tenant_id, key, year_scope)` (replacing `document_sequence_key_year_scope_uq`), the table falls
under RLS, and `SequenceService.next(key)` (`apps/api/src/sequence/sequence.service.ts:22`) keeps
its exact signature — the `SELECT … FOR UPDATE` on `eq(documentSequence.key, key)` now locks only
the caller-tenant's row *because RLS filters the scan*, with an explicit
`tenant_id = currentTenantId()` predicate added for index use. Provisioning seeds the standard
sequence rows per tenant (D14), so every tenant numbers from 1. Cross-tenant lock contention on
document numbering disappears as a side effect.

*Rejected alternative:* tenant-prefixed key strings (`"{tid}:invoice"`) keeping the single-column
PK. Rejected because it smuggles tenancy into a string convention the type system and RLS can't
see, breaks the `(key, year_scope)` unique cleanly, and leaves the table itself un-policied.

### D10. Usernames and emails are unique per tenant

`user.username` / `user.email` are globally-unique citext (`platform/users.ts:27-28`). Two factories
both employing a `somchai` (or sharing an accountant with one email) must not collide, so the
uniques become composite: `UNIQUE (tenant_id, username)` and `UNIQUE (tenant_id, email)`. Login
already knows its tenant pre-login (D5), so the credential lookup becomes
`(tenant_id, username)`; lockout counters (`failedLoginCount`, `lockedUntil`) therefore scope per
tenant automatically. The same sweep applies to every natural-key unique in the schema — `role.name`,
`role_template.name`, `item.code`, `uom.code`, `sku.sku_code`, `sku.barcode`, `stock_lot.barcode`,
`employee.emp_code`, `payroll_run.period`, `work_order.wo_no`, and every `doc_no`/`cert_no` unique
in `inventory/documents.ts` and `sales/{quotation,invoice,payment}.ts` — all become
`(tenant_id, …)`; the migration enumerates each by constraint name.

*Rejected alternative:* keeping global uniqueness and forcing email-as-username with verified
ownership. Rejected because it leaks existence across tenants (signup says "taken" → you learn a
competitor's staff email is in the system), and shop-floor accounts routinely have no email at all.

### D11. BullMQ: `tenantId` in every payload, `withTenantJob` in every worker, sweeps fan out per tenant

Queue jobs cross a process boundary — ALS does not follow (`APP_ROLE=worker` may be a different
pod). So the tenant travels **in the payload**: every job-data interface gains
`tenantId: string`, enqueue sites read it from `currentTenantId()` at publish time, and a
`withTenantJob(job, fn)` helper in `apps/api/src/tenancy/with-tenant-job.ts` is the first line of
every `BaseWorker.handle` (`apps/api/src/queue/base.worker.ts`): it validates the uuid, enters
`tenantContext` (`source: "job"`), and runs `fn` — so every `withTransaction` inside the job sets
the GUC and RLS applies identically to HTTP and worker paths. A job without a `tenantId` (except an
allowlisted set of platform jobs, e.g. the sweep schedulers themselves) fails loudly rather than
running unscoped. The four repeatable sweeps (production monitor, sales overdue, MV fallback, HR
probation scan) stop being global queries: each scheduler tick enumerates
`tenant WHERE status = 'ACTIVE'` (as a platform read — see the exempt `tenant` table) and enqueues
one per-tenant job, so a slow tenant's sweep cannot delay others, retries are per tenant, and the
worker code needs no cross-tenant query rights.

*Rejected alternatives:* (a) auto-serializing ALS into job options inside a queue wrapper — magic
that breaks the moment a job is enqueued from a platform context or re-enqueued by BullMQ retry
tooling; explicit payload fields are inspectable in the Bull UI and in dead letters; (b) one queue
per tenant — unbounded queue/worker registration, defeats BullMQ concurrency controls, and Redis
key sprawl.

### D12. Socket.IO: handshake binds the tenant; rooms are `t:{tid}:…`

Rooms `wo:{uuid}` and `timeline` (`realtime.gateway.ts:14`) are guessable across tenants: any
authenticated socket could join any work order's room. The handshake already verifies the access
token; it now also stores `client.data.tenantId = claims.tid`. Room names become
`t:{tid}:wo:{id}` and `t:{tid}:timeline`; `ROOM_PATTERN` is replaced by a parse that extracts the
`tid` segment, and `handleJoin` rejects (`{ ok: false }` + warn log) any room whose `tid` differs
from `client.data.tenantId` — the client never gets to pick its tenant, only its sub-room.
Server-side emitters (`emitToRoom` callers in M4/M6) build room names via a
`tenantRoom(tenantId, suffix)` helper so the prefix cannot be forgotten silently. The Redis adapter
needs no change — rooms are opaque strings to it.

*Rejected alternative:* per-tenant Socket.IO namespaces (`io.of("/t/{tid}")`). Namespaces are
heavier (per-namespace middleware and adapter state), the Nest gateway decorators bind one
namespace statically, and room-prefixing achieves the same isolation with a validator that is three
lines and testable.

### D13. S3: every key is `tenants/{tid}/…`, enforced inside `StorageService`

`StorageService` (`apps/api/src/storage/storage.service.ts`) currently passes caller keys straight
to S3. It becomes the enforcement point: `put`/`get`/`delete` resolve the full key as
`tenants/${currentTenantId()}/${key}` (throwing outside tenant context unless called through an
explicit platform-scoped escape hatch), and `getSignedUrl` **verifies the resolved key carries the
caller-tenant's prefix before presigning** — a presigned URL is a bearer capability that outlives
the request, so the check must happen at mint time; after that the URL is safe to hand out.
Callers keep passing their existing relative keys (payslips, report exports, employee documents),
so call sites change minimally. Tenant purge (m10) becomes "delete the `tenants/{tid}/` prefix".

*Rejected alternative:* one bucket per tenant. Cleaner blast-radius story, but bucket creation at
provisioning needs cloud-account privileges the API shouldn't hold, MinIO/self-hosted parity gets
awkward, and S3 bucket limits cap tenant count. Prefixes give the same behavior with a code-level
guarantee this change can test.

### D14. One hand-authored migration, `tooling/drizzle/0012_tenancy.sql`, with backfill to a default tenant

drizzle-kit can diff columns, but it cannot author: `CREATE ROLE`/grants, `CREATE POLICY`,
`FORCE ROW LEVEL SECURITY`, the MV rebuild + `security_barrier` views + SECURITY DEFINER function,
the data backfill, or the constraint renames — and interleaving generated and hand SQL across
several files makes the ordering fragile. So 0012 is a single hand-authored, transactional
migration (the precedent is `0001_audit_append_only.sql`), ordered:

1. Create `tenant`, `tenant_domain`, `platform_admin`, `platform_audit_log`, `support_session`.
2. Insert the default tenant (`slug` from `DEFAULT_TENANT_SLUG`, dev/self-hosted default
   `"default"`, `kind = 'CUSTOMER'`, `status = 'ACTIVE'`) — deterministic id recorded in the
   migration so re-runs are idempotent under drizzle's journal.
3. Add `tenant_id uuid` (nullable) to every business table; `UPDATE … SET tenant_id = :default`;
   then `SET NOT NULL`, add the FK to `tenant(id)`, and set
   `DEFAULT current_setting('app.tenant_id', true)::uuid`.
4. Swap constraints: `document_sequence` PK/unique (D9), `idempotency_key` PK
   `(tenant_id, key, user_id)`, every natural-key unique from D10, plus a
   `(tenant_id, <hot column>)` index sweep for the new predicates.
5. Rebuild the three MVs with `tenant_id`, create the `v_*` wrapper views and
   `reporting.refresh_mv`.
6. Create roles (idempotent `DO $$ … IF NOT EXISTS`), grants, and — last — enable + force RLS and
   create every `tenant_isolation` policy, so no earlier step runs against a policied table.

The former singleton config tables (`sso_config`, `tax_bracket`, `advance_policy`,
`document_template`, `report_schedule`) simply backfill like everything else; *new* tenants get
their rows from `seedTenantDefaults(tenantId)` (`packages/db/src/seed/`), which provisioning
(D6), the self-hosted boot (D15), and the dev seed all share — one function, three callers, no
drift between "what the migration backfilled" and "what a fresh tenant gets".

*Rejected alternative:* drizzle-kit-generated column migration + separate data/policy migrations.
Rejected because the generated diff cannot express half the change, splitting it across files
breaks the "one transaction converts the database" property, and a partially applied tenancy
migration is the worst possible failure mode (some tables policied, some not).

### D15. `DEPLOYMENT_MODE=cloud|self-hosted` — one codebase, one build

`config/env.schema.ts` gains `DEPLOYMENT_MODE` (default `cloud`), `APP_DOMAIN`, and
`DEFAULT_TENANT_SLUG`. In `self-hosted` mode: boot ensures exactly one tenant exists (the
`DEFAULT_TENANT_SLUG` tenant, created via the same `TenantProvisioningService` +
`seedTenantDefaults` if missing), the `platform/` controllers are not registered (control plane
disabled — no platform login surface exists to attack), and tenant resolution short-circuits to
the single tenant regardless of hostname (a factory's internal DNS should not need a
`tenant_domain` row to log in). Everything else — RLS, roles, `tid` claims, prefixes — runs
identically, so the self-hosted deployment is the cloud deployment with N=1, and fixes flow to
both from one branch. This is what protects the GTM plan's ฿550,000 self-hosted package without
forking the product.

*Rejected alternative:* a build-time flag or a separate self-hosted branch/fork. Rejected because
two artifacts drift immediately (the GTM maintenance fee assumes patches flow), and because
"self-hosted skips RLS since there's one tenant" is exactly the shortcut that would make the two
modes behaviorally different where it matters most.

### D16. The guarantee is kept true structurally: parity test + `pg_policies` test + adversarial e2e

Three verification layers, each its own deliverable (spec'd as requirements under
`tenant-isolation`):

1. **`apps/api/src/tenancy.parity.spec.ts`** — static, no DB, modeled on
   `enums.parity.spec.ts`: iterate every `pgTable` exported from `@erp/db`'s schema barrel
   (`packages/db/src/schema/index.ts`); each table must either appear in an explicit
   `TENANT_EXEMPT` allowlist (`tenant`, `tenant_domain`, `platform_admin`,
   `platform_audit_log`, `support_session`, `permission` — the global catalog mirror — and, when
   m8 lands them, `plan`/`subscription`/`subscription_invoice`) or expose a `tenantId` column.
   **The build fails otherwise** — this is what keeps the guarantee true as M8+ adds tables:
   forgetting tenancy on a new table becomes a red CI run, not a leak discovered in production.
2. **`apps/api/test/integration/tenancy-rls.int.spec.ts`** — connects as `erp_app`, queries
   `pg_class.relrowsecurity`/`relforcerowsecurity` and `pg_policies`, and asserts every non-exempt
   table has RLS enabled, forced, and a policy named `tenant_isolation` with both `USING` and
   `WITH CHECK` — catching the case where a table has the column but the migration missed the
   policy (the parity test cannot see SQL).
3. **`e2e/tests/tenancy.spec.ts`** — Playwright, two provisioned tenants: authenticated as tenant
   B, hit every list endpoint (expect only-B rows), fetch tenant A's known document ids (expect
   404), request presigned URLs for A's object keys (expect refusal), and join A's socket rooms
   (expect `{ ok: false }`). The adversarial layer that tests the composed system rather than its
   parts.

*Rejected alternative:* relying on review checklists and per-module tests. Rejected on the repo's
own precedent — enum and permission drift were made build-failing for far lower stakes; tenancy
regressions are the one class of bug this product cannot ship.

## Risks / Trade-offs

- **[Every authenticated request now opens a transaction]** (D3) — holds a pool connection for the
  handler's duration and adds BEGIN/COMMIT round-trips to reads. → Read-only transactions are
  cheap; `DB_POOL_MAX` should be re-sized with load testing; long-running handlers (PDF, exports)
  already offload to queues. If profiling shows pain, the escape hatch is marking specific
  read-only routes to use a *short* tx per repository call — never the un-scoped pool.
- **[The GUC is the keystone]** — a code path that opens a transaction without `SET LOCAL` sees
  zero rows (fail-closed, good) but an *invalid* value must never coerce: `withTransaction`
  validates `currentTenantId()` is a well-formed uuid before interpolating, and the value is bound
  via a parameterized `set_config('app.tenant_id', $1, true)` call, not string-spliced SQL.
- **[Owner-credential surfaces]** — migrate/seed and `reporting.refresh_mv` are the only paths
  with RLS-bypassing rights. → `DATABASE_OWNER_URL` is used only by `packages/db/src/migrate.ts`
  and the seed CLI; the SECURITY DEFINER function has an allowlist and takes no dynamic SQL; the
  `pg_policies` test also asserts `erp_app` lacks `BYPASSRLS` and MV grants.
- **[RLS planner overhead]** — every query gains a `tenant_id = $guc` qual. → All new composite
  indexes lead with `tenant_id`; the qual is a constant per transaction so plans cache well.
  Benchmark the three hottest lists (invoices, stock balance, work orders) before/after in the
  verification pass.
- **[Dev/CI running as a superuser would test nothing]** (D2) — → compose init creates both roles;
  `.env.example` points `DATABASE_URL` at `erp_app`; the integration suite asserts the connected
  role cannot bypass RLS, so a misconfigured CI fails loudly.
- **[Backfill on a live database]** — 0012 rewrites every table (ADD COLUMN + UPDATE + SET NOT
  NULL) and rebuilds MVs; on the current data volume this is minutes, but it takes ACCESS EXCLUSIVE
  locks table-by-table. → Run in a maintenance window; the migration is one transaction, so
  failure rolls back cleanly to the single-tenant state.
- **[Two audit trails]** (D7) — support-session actions must dual-write; a missed dual-write hides
  support activity from the customer. → The dual-write lives in one place (the audit subscriber
  branches on the `sup` claim), covered by an integration test.
- **[Sequence semantics change]** (D9) — per-tenant numbering means two tenants can both hold
  `INV-2026-0001`; any code assuming doc-number global uniqueness (none known — lookups are by id)
  would break. → The e2e suite asserts doc-number reuse across tenants is accepted.

## Migration Plan

1. **Contracts**: `enums/tenancy.ts`, `dto/platform.ts`, `tid` in token DTOs, tenant in
   `MeResponse`, public tenant-context DTO. Green `pnpm build && typecheck && lint`.
2. **DB schema**: `tenantColumn` helper; `tenantId` on all business tables; new platform tables;
   constraint reshapes in the drizzle definitions (kept in lockstep with the SQL); seed refactor to
   `seedTenantDefaults`. The drizzle definitions and 0012 are written together and cross-checked so
   `pnpm db:generate` produces an empty diff afterward.
3. **Migration**: hand-author `tooling/drizzle/0012_tenancy.sql` in the D14 order; apply to a copy
   of a seeded dev database; run the `pg_policies` integration test against it.
4. **API tenancy core**: `tenancy/` module (ALS, interceptor, resolution, `withTenantJob`),
   `UnitOfWork` GUC emission, `JwtGuard`/`TokenService` claims, login-by-tenant, `platform/`
   module (admin auth, provisioning, support sessions), `DEPLOYMENT_MODE` boot behavior.
5. **Infra seams**: sequence, storage, realtime, queue payloads + sweep fan-out, idempotency,
   audit, mv-refresh — each with its unit/integration tests as it lands.
6. **Business-module sweep**: per-module verification that inserts inherit the tenant default,
   uniques are composite, and no raw SQL bypasses `currentExecutor`; parity test lands here and
   must be green with the final allowlist.
7. **Web**: pre-login branding, tenant in session, `baseHeaders` untouched (the token already
   carries `tid`).
8. **Verification**: the three D16 layers plus the full suite; load-check the transaction-per-
   request change.

**Rollback**: before 0012 is applied anywhere real, revert the branch. After: 0012 is a single
transaction — a failed apply self-reverts. A deliberate rollback post-apply is a hand-authored
down script (drop policies, drop wrapper views, rebuild MVs without tenant, restore original
constraints, drop tenant columns/tables) — written alongside 0012 but expected never to run in
anger; the safer path is fix-forward since RLS is strictly additive to correctness.

## Open Questions

1. **Interceptor scope for streaming/long responses** — should SSE/file-download routes opt out of
   the request transaction (holding a tx across a slow client stall is worse than a scoped read)?
   Default: they use short per-repository transactions via an explicit opt-out decorator; confirm
   during implementation which routes qualify.
2. **`support_session` token TTL and renewal** — default: 60 minutes, non-renewable (open a new
   session, new audit row). Confirm with support workflow once m9 designs the console UX.
3. **Anomaly handling on host/`tid` mismatch** (D5) — log-only, or reject with 401 for
   browser-origin requests? Default log-only in M7; revisit when custom domains ship.
4. **Per-tenant encryption keys** — `ENCRYPTION_KEY` (M2 PII crypto) stays instance-wide in M7;
   per-tenant key derivation (HKDF from the master key + tenant id) would strengthen the
   self-hosted export story. Deferred, needs a re-encryption migration design.
5. **`TENANT_EXEMPT` review cadence** — the allowlist is append-only by nature; require a
   CODEOWNERS-gated review on changes to it, or is the PR-diff visibility of the spec file enough?
   Default: add the file to CODEOWNERS in m9's ops hardening.
