# M0-C · NestJS cross-cutting infrastructure

**Date**: 2026-07-04
**Branch**: `feature/m0c-nestjs-infra`
**Issue**: [#6 — M0-C · NestJS cross-cutting infra](https://github.com/keenlab-io/garment-erp/issues/6)
**Author**: Claude

## Overview

Implements the NestJS cross-cutting layer under `apps/api/src/` that every business
module (M1–M6) depends on: configuration + env validation, a persistence module
with a Unit-of-Work / transaction context, a uniform error envelope, optimistic
concurrency and cursor pagination helpers, a domain-event bus, authentication +
authorization with a pluggable resolver seam, DB-backed audit, race-safe document
sequencing, idempotency, and the shared infra services (queue, storage, PDF,
realtime). This is tasks §3 (3.1–3.15) of the M0 foundation change; it consumes the
already-merged `@erp/db` (M0-B) and `@erp/contracts` (M0-A) layers without
duplicating their enums or DTO helpers.

The design is documented in `docs/plans/M0-foundation.md` §4 and
`openspec/changes/m0-foundation/design.md` (decisions D1–D12); this change executes
that verified shape.

## Scope

**In scope (issue #6):** the infra code and app wiring listed below.

**Deferred to issue #7 (M0-D):** the Vitest/`unplugin-swc` test harness, unit &
integration tests, and adding Redis/MinIO to `infra/docker-compose.yml` and the
devcontainer. Consequently only the **runtime** deps from task 3.1 were installed;
the test-only dev deps (`vitest`, `@vitest/coverage-v8`, `supertest`,
`testcontainers`, `unplugin-swc`, `@swc/core`, …) come with #7.

## Changes

### New files (`apps/api/src/`)
- `config/env.schema.ts`, `config/config.module.ts` — zod env validation (fail-fast) + global config.
- `db/db.tokens.ts`, `db/db.module.ts`, `db/tx-context.ts`, `db/unit-of-work.service.ts` — global `DbModule` (`DB` token from `createDb`), `txContext` ALS (`currentExecutor`/`onCommit`), `UnitOfWork.withTransaction` (nested joins caller's tx; onCommit flushes after COMMIT); pool closed on destroy.
- `common/errors/app-exception.ts`, `common/errors/all-exceptions.filter.ts` — `AppException` hierarchy + global filter emitting `{ code, message, details }` (code→HTTP, `ZodError`→400, PG `23505`→409, `HttpException` by status, unknown→scrubbed 500).
- `common/concurrency/if-match.ts` — `parseIfMatch` / `assertVersion` (stale → 409).
- `common/pagination/cursor.ts` — `buildPage` over the `@erp/utils` cursor codec.
- `common/idempotency/*` — `IdempotencyService` + `IdempotencyInterceptor` + module.
- `events/*` — `DomainEvent` + `makeEvent`, `EventBusService` (`publishInTransaction` / `publishAfterCommit`), `EventEmitterModule.forRoot({ wildcard, delimiter: "." })`.
- `auth/*` — `PasswordService` (argon2id), `TokenService` (JWT `{sub,sid,pv}` / `{sub,sid}`), `auth.tokens.ts` seams (`USER_LOOKUP`/`SESSION_LOOKUP`/`PERMISSION_RESOLVER`) + `auth.defaults.ts`, `JwtGuard`, `PermissionsGuard`, `authz.ts` (`assertPermissions`), `@Public`/`@Permissions`/`@CurrentUser` decorators, global `auth.module.ts`.
- `audit/*` — `AuditService.record` + `requireReason` (422), `AuditSubscriber` (`@OnEvent("**")`).
- `sequence/*` — `SequenceService.next` (`SELECT … FOR UPDATE`, yearly reset, format render) + `renderSequenceFormat`.
- `queue/*` — `QueueModule` (`maxRetriesPerRequest: null`, 5 named queues), `DEFAULT_JOB_OPTIONS`, `BaseWorker`.
- `storage/*`, `pdf/*`, `realtime/*` — `StorageService` (S3 v3), `PdfService` (lazy puppeteer), `RealtimeGateway` (Socket.IO JWT handshake).

### Modified files
- `apps/api/package.json` — added runtime deps (drizzle-orm, postgres, `@nestjs/{config,event-emitter,jwt,bullmq,websockets,platform-socket.io}`, bullmq, ioredis, socket.io, argon2, aws-sdk s3, puppeteer, `@erp/db`).
- `apps/api/src/app.module.ts` — imports all infra modules; registers `APP_FILTER`, `APP_GUARD` (JwtGuard then PermissionsGuard), `APP_INTERCEPTOR`.
- `apps/api/src/main.ts` — `enableShutdownHooks()`, port from `ConfigService`, logs `API_PREFIX`.
- `apps/api/src/health/health.controller.ts`, `apps/api/src/invoice/invoice.controller.ts` — `@Public()` at the **class** level (ts-rest metadata gotcha, design D7).

## Key design points honored
- **ESM**: explicit `.js` specifiers on every relative import.
- **Auth seam** (D6): default `PERMISSION_RESOLVER` returns the empty set — only super-admins pass permission checks in M0; M1 rebinds the token with no M0 edits.
- **Instant revocation** (D5): `JwtGuard` rejects when `user.permissionsVersion !== claims.pv`.
- **Transaction context** (D3): events fired via `publishInTransaction` join the active tx through `currentExecutor`; `publishAfterCommit` defers to `onCommit`.
- **BullMQ** connection uses `maxRetriesPerRequest: null`; Redis URL parsed to plain ioredis options to avoid the version-skew type conflict between the app's ioredis and bullmq's bundled copy.

## Testing / Verification
Tests are deferred to #7. This change was verified by:
- `pnpm build && pnpm typecheck && pnpm lint` — all green from the repo root.
- Live boot against the dev Postgres (`postgres:5432`) + a local Redis:
  - routes mapped under `/api/v1`;
  - `GET /api/v1/health` → **200** without a token (class-level `@Public`);
  - a temporarily non-public route → **401** with body `{ "code": "UNAUTHENTICATED", "message": "Authentication required", "details": [] }` (both no-token and bad-token); `@Public` restored afterward;
  - clean startup of every module including BullMQ → Redis.

## Related
- Plan: `docs/plans/M0-foundation.md` §4
- Design: `openspec/changes/m0-foundation/design.md`
- Tasks: `openspec/changes/m0-foundation/tasks.md` §3 (all ticked)
- Follow-up: issue #7 (M0-D) — test harness + Redis/MinIO infra
