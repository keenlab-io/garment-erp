# M0 — Shared Foundation

## Why

The repo is currently a runnable skeleton: apps boot and share one typed contract, but there is no database, no auth, and none of the cross-cutting conventions (uniform errors, idempotency, optimistic concurrency, audit, document numbering) that every business module (M1–M6) assumes. Building these once as a shared foundation — before any domain module — prevents each module from reinventing them inconsistently and lets M1–M6 focus purely on domain behavior.

## What Changes

- **New package `@erp/db`**: framework-agnostic persistence layer — schema, Postgres client, migration/seed runners, and the platform tables (`user`, `session`, `audit_log`, `document_sequence`, `idempotency_key`) that all modules extend.
- **Authentication & authorization** in `apps/api`: password login, JWT access/refresh tokens backed by server-side sessions, instant revocation via a per-user permissions version, a typed permission catalog, and guards with a pluggable permission resolver (M1 rebinds it to roles).
- **API-wide conventions**, enforced centrally rather than per endpoint:
  - uniform `{ code, message, details }` error envelope for every failure;
  - `Idempotency-Key` replay protection on mutating requests;
  - optimistic concurrency via a `version` column and `If-Match` (409 on staleness);
  - cursor-based pagination with a shared `{ data, next_cursor }` shape.
- **Domain events & audit**: a standard event envelope with in-transaction vs after-commit dispatch, plus an append-only audit trail (DB-enforced) with mandatory reasons for sensitive actions.
- **Document sequencing**: race-safe, formatted document numbers (e.g. `SO-2026-0001`) with optional yearly reset.
- **Shared infrastructure services**: background job queues (Redis/BullMQ), object storage (S3/MinIO), server-side PDF rendering, and a JWT-authenticated realtime websocket gateway.
- **Contracts & utils extensions**: `ErrorCode` and IAM enums, shared DTO helpers (`API_PREFIX`, pagination, error responses, headers), full permission catalog, and a cursor codec in `@erp/utils`.
- **Dev environment**: Redis and MinIO added to docker-compose/devcontainer; environment validated at boot; Vitest unit + Testcontainers integration test harness.

No breaking changes for end users (pre-release skeleton). Existing demo endpoints (`health`, `invoice`) move under `/api/v1` and adopt the shared error envelope.

## Capabilities

### New Capabilities

- `persistence`: the `@erp/db` package — database schema conventions (audit/version/money/qty columns, soft delete), Postgres client, migrations and idempotent seed, and the platform tables every module builds on.
- `authentication`: password hashing, JWT access/refresh tokens, server-side sessions, the global auth guard, and instant token revocation via permissions versioning.
- `authorization`: the typed permission catalog, permissions guard and `assertPermissions` for per-endpoint checks, super-admin bypass, and the pluggable permission-resolver seam.
- `error-handling`: the uniform `{ code, message, details }` error envelope, the `ErrorCode` enum, and centralized mapping of validation, conflict, and unexpected errors to HTTP responses.
- `idempotency`: `Idempotency-Key` header support with stored responses and safe replay of repeated mutating requests.
- `optimistic-concurrency`: entity `version` column with `If-Match` enforcement and 409 `STATE_CONFLICT` on stale writes.
- `cursor-pagination`: opaque cursor codec and the standard paginated response shape for all list endpoints.
- `domain-events`: the `DomainEvent` envelope with in-transaction (atomic) and after-commit (eventual) dispatch semantics and transaction-scoped handlers.
- `audit-log`: append-only audit trail written from domain events or directly, with database-level immutability and required reasons for sensitive actions.
- `document-sequencing`: unique, gapless, formatted document numbers per key with optional yearly reset, safe under concurrency.
- `background-queue`: named BullMQ job queues with retry/dead-letter defaults and an idempotent base worker.
- `object-storage`: S3-compatible file storage (MinIO in dev) with upload, signed download URLs, and deletion.
- `pdf-rendering`: server-side HTML-to-PDF rendering for documents, executed via the background queue.
- `realtime-gateway`: JWT-authenticated websocket gateway with room-based broadcasting for live updates.

### Modified Capabilities

None — `openspec/specs/` is empty; this change introduces the first specs.

## Impact

- **Packages**
  - `@erp/db` — **new** workspace package (schema, client, migrate/seed), with an ESLint boundary keeping it free of `@erp/contracts` and NestJS.
  - `@erp/contracts` — new enums (`ErrorCode`, IAM), shared DTO helpers, `API_PREFIX`, extended permission catalog; existing `health`/`invoice` DTOs re-wrapped with the `/api/v1` prefix and shared error responses (impact only — no requirement change to those endpoints).
  - `@erp/utils` — cursor codec added.
  - `apps/api` — all cross-cutting NestJS modules (config, db, errors, auth, events, audit, sequence, idempotency, queue, storage, pdf, realtime) plus the test harness.
- **New runtime dependencies**: `drizzle-orm`, `postgres`, `@nestjs/config`, `@nestjs/jwt`, `@nestjs/event-emitter`, `@nestjs/bullmq` + `bullmq` + `ioredis`, `@nestjs/websockets` + `socket.io`, `argon2`, `@aws-sdk/client-s3` + `s3-request-presigner`, `puppeteer`. Dev: `drizzle-kit`, `vitest`, `testcontainers`, `unplugin-swc`.
- **Infra**: Postgres already present; add **Redis** and **MinIO** services (with healthchecks) to `infra/docker-compose.yml` and the devcontainer, plus Chromium runtime libraries for PDF rendering and new env vars (`REDIS_URL`, `S3_*`, `JWT_*`) validated at boot.
- **Downstream**: M1–M6 module plans all assume these capabilities exist; M1 rebinds the permission resolver and upgrades event dispatch to a transactional outbox.
