## ADDED Requirements

### Requirement: Background jobs carry and restore tenant context
Every BullMQ job payload SHALL carry `tenantId`, captured from `currentTenantId()` at
enqueue time, and every worker SHALL restore tenant context before touching the
database via `withTenantJob(job, fn)` (`apps/api/src/tenancy/with-tenant-job.ts`), which
validates the uuid and enters `tenantContext` (`source: "job"`) so that all transactions
inside the job set `app.tenant_id`. A job with no `tenantId` MUST fail loudly unless its
name is in the explicit `PLATFORM_JOBS` allowlist (e.g. the sweep schedulers). ALS does
not cross the process boundary — `APP_ROLE=worker` may be a separate process — which is
why the tenant travels in the payload, not in ambient state.

#### Scenario: A worker writes under the right tenant
- **WHEN** a PDF job enqueued from tenant A's request is processed by a worker process
- **THEN** `withTenantJob` scopes the job to tenant A and every row it writes carries tenant A's id

#### Scenario: A tenant-less job fails closed
- **WHEN** a job outside `PLATFORM_JOBS` is enqueued without `tenantId`
- **THEN** the worker rejects it with an error before any database access, and the failure lands in the dead-letter set

### Requirement: Repeatable sweeps fan out per active tenant
The four global sweeps — production monitor (`PRODUCTION_MONITOR_INTERVAL_MS`), sales
overdue (`SALES_OVERDUE_SWEEP_MS`), MV fallback refresh (`MV_REFRESH_FALLBACK_MS`), and
the HR probation scan (`PROBATION_ALERT_DAYS`) — SHALL stop running as single global
queries: each scheduler tick enumerates tenants with `status = 'ACTIVE'` and enqueues
one tenant-scoped job per tenant, so per-tenant failures and retries are independent and
worker code needs no cross-tenant query rights.

#### Scenario: Only active tenants are swept
- **WHEN** the overdue sweep ticks while tenant A is ACTIVE and tenant B is SUSPENDED
- **THEN** exactly one overdue job is enqueued, carrying tenant A's id

#### Scenario: One tenant's failure does not block others
- **WHEN** the probation-scan job for tenant A throws
- **THEN** tenant B's probation job still runs to completion, and only A's job retries

### Requirement: Object keys are tenant-prefixed and verified at presign time
`StorageService` (`apps/api/src/storage/storage.service.ts`) SHALL resolve every key as
`tenants/{tid}/{key}` using `currentTenantId()` for `put`, `get`, and `delete`, throwing
outside tenant scope, and `getSignedUrl` SHALL verify the resolved key carries the
caller-tenant's prefix before presigning — a presigned URL is a bearer capability that
outlives the request, so the boundary check happens at mint time. Callers keep passing
relative keys; the prefix is not their concern.

#### Scenario: Uploads land under the tenant prefix
- **WHEN** tenant A's payslip render calls `storage.put("payslips/2026-08/emp-42.pdf", …)`
- **THEN** the object is stored at `tenants/{A}/payslips/2026-08/emp-42.pdf`

#### Scenario: Foreign-prefix presign is refused
- **WHEN** code scoped to tenant B attempts to presign a key resolving under `tenants/{A}/`
- **THEN** `getSignedUrl` throws before contacting S3 and no URL is minted

### Requirement: Socket rooms are tenant-namespaced and join-validated
The realtime gateway SHALL bind each socket to its token's tenant at handshake
(`client.data.tenantId = claims.tid`), rename rooms to `t:{tid}:wo:{id}` and
`t:{tid}:timeline`, and reject any `join` whose room `tid` segment differs from the
socket's bound tenant. Server-side emitters SHALL build room names through a
`tenantRoom(tenantId, suffix)` helper so the prefix cannot be omitted silently.

#### Scenario: Cross-tenant join is rejected
- **WHEN** a socket authenticated for tenant B emits `join` for `t:{A}:wo:{some-uuid}`
- **THEN** the gateway acknowledges `{ ok: false }` and the socket is not added to the room

#### Scenario: Broadcasts stay inside the tenant
- **WHEN** a production scan in tenant A triggers a work-order broadcast
- **THEN** it is emitted to `t:{A}:wo:{id}` and no tenant B socket receives it

### Requirement: MV refresh debounce is tenant-aware
The materialized-view refresh scheduler SHALL key its debounce map by
`(tenantId, view)` instead of `view` (`MV_REFRESH_DEBOUNCE_MS` semantics otherwise
unchanged), so one tenant's event burst neither delays nor absorbs another tenant's
refresh signal. The fallback sweep refreshes each view once per tick (the rebuilt MVs
hold all tenants' rows in one relation).

#### Scenario: Tenant bursts debounce independently
- **WHEN** tenant A posts twenty invoices within the debounce window while tenant B posts one
- **THEN** the scheduler tracks `(A, mv_sales_daily)` and `(B, mv_sales_daily)` as separate debounce keys

### Requirement: Provisioning seeds per-tenant defaults for former singletons
`seedTenantDefaults(tenantId)` (`packages/db/src/seed/`) SHALL create, for a new tenant,
the rows that were single-tenant singletons: the standard `document_sequence` rows, the
Thai `tax_bracket` schedule, `sso_config`, `advance_policy`, default
`document_template`s, `ot_rate`s, base `uom`s, and base roles. The same function SHALL
be used by cloud provisioning (`TenantProvisioningService`), the self-hosted boot, and
the dev seed, so backfilled and freshly provisioned tenants cannot drift.

#### Scenario: A new tenant can issue documents immediately
- **WHEN** a tenant is provisioned and its admin posts the first invoice
- **THEN** the tenant's own `document_sequence` row exists and numbering starts at 1

#### Scenario: One seed function, three callers
- **WHEN** the dev seed, a cloud provisioning call, and a self-hosted first boot each create a tenant
- **THEN** all three tenants receive identical default rows from `seedTenantDefaults`
