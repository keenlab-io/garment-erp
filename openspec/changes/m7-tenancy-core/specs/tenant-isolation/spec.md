## ADDED Requirements

### Requirement: Every business table is tenant-scoped with forced Row-Level Security
Every business table in `packages/db/src/schema/` SHALL carry a `tenant_id uuid NOT NULL`
column (FK to `tenant.id`, default `current_setting('app.tenant_id', true)::uuid`) and
SHALL have `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and a policy named
`tenant_isolation` whose `USING` and `WITH CHECK` clauses both compare `tenant_id` to
`current_setting('app.tenant_id', true)::uuid`. Postgres RLS MUST be the primary
isolation control; application-level `WHERE tenant_id = …` predicates are
defence-in-depth and MAY be added for index selectivity, but correctness MUST NOT depend
on them. Only tables in the explicit `TENANT_EXEMPT` allowlist (`tenant`,
`tenant_domain`, `platform_admin`, `platform_audit_log`, `support_session`,
`permission`) are excused.

#### Scenario: No tenant in scope reads nothing
- **WHEN** a query runs in a transaction where `app.tenant_id` has not been set
- **THEN** `current_setting('app.tenant_id', true)` is NULL and the `tenant_isolation` policy exposes zero rows
- **AND** an attempted INSERT into any policied table is rejected by the `WITH CHECK` clause

#### Scenario: A query cannot see another tenant's rows even without an application filter
- **WHEN** a repository executes a query with no `tenant_id` predicate while `app.tenant_id` is set to tenant A
- **THEN** only tenant A's rows are visible, because the policy — not the application — filters the scan

#### Scenario: Inserts inherit the ambient tenant
- **WHEN** a service inserts a row without specifying `tenantId` inside a transaction scoped to tenant A
- **THEN** the column default assigns tenant A's id and the `WITH CHECK` clause passes

#### Scenario: A forged tenant_id on insert is rejected
- **WHEN** code inside tenant A's transaction attempts to INSERT or UPDATE a row with `tenant_id` set to tenant B
- **THEN** the statement fails the `tenant_isolation` policy's `WITH CHECK` and no row is written

### Requirement: Runtime role split — erp_owner owns, erp_app runs
The database SHALL define two roles: `erp_owner`, which owns every table, view, and
function and is used only by migrations (`packages/db/src/migrate.ts`) and seeds; and
`erp_app`, the runtime role in `DATABASE_URL`, which MUST be `NOBYPASSRLS`, MUST NOT own
any policied relation, and holds only table-level DML grants. Because Postgres silently
bypasses RLS for table owners, superusers, and `BYPASSRLS` roles, this split is
load-bearing: the API process MUST never connect as `erp_owner` or a superuser.
Development and CI environments SHALL also connect as `erp_app` so that RLS is exercised
everywhere the code runs.

#### Scenario: Runtime role cannot bypass RLS
- **WHEN** the API connects with the `erp_app` credentials from `DATABASE_URL`
- **THEN** `pg_roles.rolbypassrls` is false for the connected role and `rolsuper` is false
- **AND** every policied table filters by the `tenant_isolation` policy for that connection

#### Scenario: Migrations run with owner rights
- **WHEN** `pnpm db:migrate` applies `tooling/drizzle/0012_tenancy.sql`
- **THEN** it connects using the owner credentials (`DATABASE_OWNER_URL`), which may create roles, policies, and views
- **AND** the applied objects are owned by `erp_owner`, not `erp_app`

#### Scenario: A misconfigured owner connection is still fenced
- **WHEN** a process mistakenly connects as `erp_owner` (a non-superuser owner) and queries a business table
- **THEN** `FORCE ROW LEVEL SECURITY` keeps the `tenant_isolation` policy in effect for the owner as well

### Requirement: The unit of work scopes every transaction to the current tenant
`UnitOfWork.withTransaction` (`apps/api/src/db/unit-of-work.service.ts`) SHALL, when
opening a new (non-nested) transaction with a tenant in scope, execute
`set_config('app.tenant_id', $1, true)` as the first statement, with the tenant id read
from `currentTenantId()` and validated as a well-formed uuid before use. The value MUST
be bound as a query parameter, never interpolated into SQL text. Nested
`withTransaction` calls join the caller's transaction unchanged, and `onCommit` hooks
keep their M0 after-commit semantics.

#### Scenario: SET LOCAL is the first statement
- **WHEN** `withTransaction` opens a transaction while `tenantContext` holds tenant A
- **THEN** `app.tenant_id` equals tenant A's id for every statement in that transaction
- **AND** the setting does not persist on the pooled connection after COMMIT (transaction-local scope)

#### Scenario: Malformed tenant id fails before any query
- **WHEN** `currentTenantId()` returns a value that is not a well-formed uuid
- **THEN** `withTransaction` throws before opening the transaction and no statement reaches the database

#### Scenario: Nested transactions inherit the scope
- **WHEN** a service inside tenant A's request transaction calls `withTransaction` again
- **THEN** the nested call joins the existing transaction and the GUC set by the outer call still applies

### Requirement: Every authenticated request runs inside a tenant-scoped transaction
A global `TenantTransactionInterceptor`
(`apps/api/src/tenancy/tenant-transaction.interceptor.ts`, registered as
`APP_INTERCEPTOR`) SHALL wrap every authenticated request's handler in
`UnitOfWork.withTransaction`, because `currentExecutor(db)`
(`apps/api/src/db/tx-context.ts`) otherwise falls through to the raw pool for reads,
where `SET LOCAL` does not apply. Because Nest guards run before interceptors, the
`JwtGuard`'s own user/session lookups SHALL run in a short tenant-scoped transaction of
their own after the `tid` claim is verified.

#### Scenario: A plain GET handler is tenant-scoped
- **WHEN** an authenticated GET request reaches a handler that performs reads with no explicit transaction
- **THEN** the interceptor has already opened a transaction with `app.tenant_id` set from the caller's `tid`
- **AND** `currentExecutor(db)` returns that transaction, not the raw pool

#### Scenario: Guard lookups are also scoped
- **WHEN** `JwtGuard` loads the user and session rows for a verified token
- **THEN** those lookups execute inside a transaction whose `app.tenant_id` equals the token's `tid`
- **AND** a token whose `tid` does not match the session row's `tenant_id` is rejected with 401

### Requirement: Tenant context is carried in a dedicated ALS, separate from txContext
A `tenantContext` `AsyncLocalStorage` (`apps/api/src/tenancy/tenant-context.ts`) SHALL
hold `{ tenantId, source }` and expose `currentTenantId()`. It MUST be separate from
`txContext` because tenant scope outlives any single transaction: one request runs the
auth-lookup transaction and the handler transaction under one tenant, and background
jobs and socket handlers run many transactions per tenant scope. Entry points establish
it: `JwtGuard` (from the `tid` claim), the hostname-resolution middleware (pre-login),
`withTenantJob` (from the job payload), and the realtime gateway (from the handshake).

#### Scenario: Tenant scope spans multiple transactions
- **WHEN** a BullMQ job runs three sequential `withTransaction` calls under `withTenantJob`
- **THEN** all three transactions set the same `app.tenant_id` from the single ambient `tenantContext`

#### Scenario: No tenant context outside an entry point
- **WHEN** code calls `currentTenantId()` outside any of the four entry points (e.g. at module init)
- **THEN** it returns null and any attempted tenant-scoped work fails closed rather than defaulting to a tenant

### Requirement: Tenant identity is never accepted from request input
No DTO in `@erp/contracts`, no query parameter, and no header on the tenant-facing API
SHALL carry a `tenant_id` that influences scoping. The tenant SHALL be derived
exclusively from the verified `tid` token claim (authenticated requests) or the
host-resolved tenant (pre-login requests). The sole exception is the platform control
plane (`contract.platform`), where a platform admin names a target tenant explicitly and
every such action is platform-audited.

#### Scenario: A tenant_id in the body is inert
- **WHEN** an authenticated user of tenant B sends a request whose JSON body includes `"tenant_id": "<tenant A id>"`
- **THEN** the field is rejected by zod validation (unknown key) or ignored by the schema
- **AND** the request executes scoped to tenant B, and no tenant A row is read or written

#### Scenario: A forged header does not switch tenants
- **WHEN** a request carries a valid tenant-B token plus a crafted `X-Tenant-Id` or `Host` header naming tenant A
- **THEN** scoping still derives from the token's `tid` and the response contains only tenant B data

### Requirement: Static tenancy parity test fails the build for tenant-less tables
`apps/api/src/tenancy.parity.spec.ts` SHALL statically (no database) iterate every table
exported from `@erp/db`'s schema barrel (`packages/db/src/schema/index.ts`) and assert
that each either appears in the explicit `TENANT_EXEMPT` allowlist or exposes a
`tenantId` column. The test MUST fail the build otherwise, naming the offending table —
this is the mechanism that keeps the isolation guarantee true as M8+ adds tables. The
pattern follows `apps/api/src/enums.parity.spec.ts`.

#### Scenario: A new table without tenancy fails CI
- **WHEN** a future change exports a new `pgTable` from the schema barrel with no `tenantId` column and no allowlist entry
- **THEN** `pnpm test` fails with a message naming that table
- **AND** the failure occurs with no database connection required

#### Scenario: Exemptions are explicit and reviewed
- **WHEN** a table is intentionally platform-scoped
- **THEN** it must be added to the `TENANT_EXEMPT` array in the spec file, making the exemption a visible, reviewable diff

### Requirement: pg_policies integration test proves the database enforces isolation
An integration test (`apps/api/test/integration/tenancy-rls.int.spec.ts`) SHALL connect
as the runtime role and assert, for every non-exempt table: `pg_class.relrowsecurity`
is true, `pg_class.relforcerowsecurity` is true, and `pg_policies` contains a
`tenant_isolation` policy with both a `qual` (USING) and a `with_check` expression
referencing `app.tenant_id`. It SHALL additionally assert the connected role has
`NOBYPASSRLS`, is not a superuser, and holds no SELECT grant on the `mv_*` relations.

#### Scenario: A table with the column but no policy is caught
- **WHEN** a migration adds a tenant-scoped table but omits its `CREATE POLICY`/`FORCE` statements
- **THEN** the integration test fails naming the table, even though the static parity test passes

#### Scenario: Unscoped connection reads nothing
- **WHEN** the test opens a transaction as `erp_app` without setting `app.tenant_id` and selects from each business table
- **THEN** every select returns zero rows and every insert attempt fails

### Requirement: Cross-tenant end-to-end attack suite
A Playwright suite (`e2e/tests/tenancy.spec.ts`) SHALL provision two tenants and,
authenticated as tenant B, attempt: every module's list endpoint (expect only tenant B
rows), direct fetches of tenant A's known document ids (expect 404 NOT_FOUND), presigned
URL requests for tenant A's object keys (expect refusal), and socket `join` of tenant
A's rooms (expect rejection). The suite is the composed-system check over the RLS,
storage, and realtime layers.

#### Scenario: List endpoints never leak
- **WHEN** tenant B's admin lists invoices, work orders, employees, items, and users
- **THEN** every page contains only rows whose owner is tenant B, with tenant A data present in the database

#### Scenario: Direct id probes return 404
- **WHEN** tenant B requests `GET /invoices/{id}` with an id known to belong to tenant A
- **THEN** the response is 404 NOT_FOUND — indistinguishable from a nonexistent id, leaking neither data nor existence

#### Scenario: Foreign presign and foreign room are refused
- **WHEN** tenant B requests a presigned URL for a key under `tenants/{A}/…` and emits `join` for `t:{A}:timeline`
- **THEN** the presign is refused and the join acknowledges `{ ok: false }`
