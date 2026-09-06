## MODIFIED Requirements

### Requirement: Base worker with logging and idempotent processing
The system SHALL provide a base worker class that wraps job handling with
start/success/failure logging, and every worker implementation MUST be idempotent on
`(event, correlation_id)` so a retried or duplicate job produces no additional effect
beyond the first successful processing. Every worker MUST additionally restore tenant
context before any database access by running its handler through
`withTenantJob(job, fn)` (`apps/api/src/tenancy/with-tenant-job.ts`), which validates
`job.data.tenantId` and enters the `tenantContext` ALS so all transactions inside the
job set `app.tenant_id`. A job without a `tenantId` MUST fail before any side effect
unless its name is in the explicit `PLATFORM_JOBS` allowlist.

#### Scenario: Job processing is logged
- **WHEN** a worker processes a job
- **THEN** the worker logs the job start and its outcome (success or failure with the error)

#### Scenario: Duplicate job has no double effect
- **WHEN** a job carrying an `(event, correlation_id)` pair that was already processed successfully is delivered again (retry or duplicate enqueue)
- **THEN** the worker completes without repeating the side effect (no second email sent, no second file written)

#### Scenario: Worker writes are tenant-scoped
- **WHEN** a worker processes a job whose payload carries tenant A's id
- **THEN** every transaction the handler opens runs with `app.tenant_id` set to tenant A, and Row-Level Security applies exactly as on the HTTP path

#### Scenario: Tenant-less business job fails closed
- **WHEN** a job outside `PLATFORM_JOBS` arrives without a valid `tenantId`
- **THEN** the worker throws before touching the database and the job lands in the failed set

## ADDED Requirements

### Requirement: Job payloads carry the tenant across the process boundary
Every enqueued job's data SHALL include `tenantId`, captured from `currentTenantId()` at
enqueue time — the ALS does not cross the process boundary (`APP_ROLE=worker` runs in a
separate process), so ambient context is never relied upon between enqueue and
processing. Payload tenant ids are inspectable in the queue tooling and in dead-letter
entries for triage.

#### Scenario: Enqueue captures the ambient tenant
- **WHEN** a request handler in tenant A's scope enqueues a PDF job
- **THEN** the persisted job data contains tenant A's id

#### Scenario: Retries preserve the tenant
- **WHEN** a failed job is retried by BullMQ
- **THEN** the retry carries the original payload's `tenantId` and processes under the same tenant
