# M0 — Shared Foundation: Tasks

## 1. Foundations: `@erp/utils` + `@erp/contracts`

- [x] 1.1 Add `@types/node` to `@erp/utils` and implement `src/cursor.ts` — `encodeCursor(payload)` / `decodeCursor(s)` (base64url JSON) + `tryDecodeCursor`; export from the package index
- [x] 1.2 Add `packages/contracts/src/enums/error-code.ts` — `ErrorCode` const object + type + `isErrorCode` covering `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `STATE_CONFLICT`, `BUSINESS_RULE`, `REAUTH_REQUIRED`, `IDEMPOTENT_REPLAY`, `INTERNAL`
- [x] 1.3 Add `packages/contracts/src/enums/iam.ts` — `UserStatus` and `AuditAction` enums (rest of IAM lands in M1)
- [x] 1.4 Add `packages/contracts/src/dto/_shared.ts` — `API_PREFIX = "/api/v1"`, `uuid`, `paginationQuery` (limit coerced 1–100 default 50, optional cursor), `paginated(item)` → `{ data, next_cursor }`, `errorResponse` → `{ code, message, details }`, `jobAccepted` → `{ job_id }`, `idempotencyKeyHeader`, `ifMatchHeader`, and `withErrors(responses)` merging 400/401/403/404/409/422 → `errorResponse`
- [x] 1.5 Re-wrap `dto/health.ts` and `dto/invoice.ts` with `{ pathPrefix: API_PREFIX }` and `withErrors(...)` on their responses
- [x] 1.6 Extend `packages/contracts/src/permissions/catalog.ts` with all M1–M6 module permission codes so `@Permissions(...)` / `assertPermissions(...)` typo-check
- [x] 1.7 Verify: `pnpm build && pnpm typecheck && pnpm lint` green across the workspace

## 2. `@erp/db` package

- [x] 2.1 Scaffold `packages/db` — `package.json` (deps `drizzle-orm`, `postgres`, `@erp/utils`, `argon2`; dev `drizzle-kit`, `@erp/config`, `@types/node`, `tsx`), tsconfig extending the shared base, and an ESLint config with a `dbBoundaries` rule banning `@erp/contracts` and `@nestjs/*` imports
- [x] 2.2 Implement `src/base-columns.ts` — `citext` customType, `auditColumns` (uuid PK `gen_random_uuid()`, created/updated/deleted timestamps, createdBy/updatedBy with no FK in the helper), `versionColumn`, `money`/`qty`/`rate` numeric helpers (18,4 / 18,6 / 9,6), `notDeleted`; note `isNull` imports from `drizzle-orm`, not `pg-core`
- [x] 2.3 Implement `src/schema/enums.ts` — `$type` string-unions (`UserStatus`, `AuditAction`, ...) mirroring `@erp/contracts` enums
- [x] 2.4 Implement `src/client.ts` — `createDb(url)` returning `{ db, queryClient }` with `casing: "snake_case"`, export `Db` and `Tx` types
- [x] 2.5 Implement platform schema files under `src/schema/platform/` — `users` (citext username/email unique, passwordHash, status default PENDING, permissionsVersion default 1, isSuperAdmin, failedLoginCount, lockedUntil, lastLoginAt, audit + version columns), `sessions` (userId FK, tokenId, permissionsVersion snapshot, ip inet, userAgent, expiresAt, revokedAt, partial index `WHERE revoked_at IS NULL`), `audit-log`, `document-sequence` (`unique(key, year_scope)`, single row per key), `idempotency-key` (PK `(key, user_id)`, requestHash, responseStatus, responseBody jsonb, expiresAt)
- [x] 2.6 Add `src/schema/index.ts` and `src/index.ts` re-exports (`.js` specifiers) — client, base-columns, and schema (also as `schema`)
- [x] 2.7 Add `drizzle.config.ts` — `schema: "./dist/schema/index.js"` (compiled output), `out: "../../tooling/drizzle"`, `casing: "snake_case"`; wire `db:generate` as `tsc --build && drizzle-kit generate` and run it
- [x] 2.8 Hand-edit migration `0000` to prepend `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` and `CREATE EXTENSION IF NOT EXISTS "citext";`
- [x] 2.9 Generate a custom migration (`drizzle-kit generate --custom --name=audit_append_only`) with the `audit_log_no_mutate()` trigger function and `BEFORE UPDATE OR DELETE` trigger enforcing append-only
- [x] 2.10 Implement `src/migrate.ts` (postgres-js migrator resolving `tooling/drizzle` from `dist`) and idempotent `src/seed/seed.ts` (upsert argon2id super-admin; `onConflictDoNothing` base `document_sequence` rows)
- [x] 2.11 Wire scripts — `@erp/db` `db:generate`/`db:migrate`/`db:seed`/`db:studio`, `apps/api` and root `db:*` delegating via `pnpm --filter @erp/db`, and `turbo.json` `db:*` tasks as `cache: false` (studio also `persistent`)
- [x] 2.12 Run `pnpm db:migrate && pnpm db:seed` against the dev Postgres and confirm tables, trigger, super-admin, and sequences exist; verify `pnpm build && pnpm typecheck && pnpm lint`

## 3. NestJS cross-cutting infrastructure (`apps/api`)

- [x] 3.1 Install `apps/api` runtime deps (`drizzle-orm`, `postgres`, `@nestjs/config@^3`, `@nestjs/event-emitter@^2`, `@nestjs/jwt@^10`, `@nestjs/bullmq@^10`, `bullmq`, `ioredis`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `argon2`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `puppeteer`, `@erp/db`) and dev deps (`vitest`, `@vitest/coverage-v8`, `supertest`, `@types/supertest`, `testcontainers`, `tsx`, `unplugin-swc`, `@swc/core`)
- [x] 3.2 Implement `config/` — `env.schema.ts` (zod validation of `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `S3_*`) and a global `config.module.ts` that fails fast on invalid env
- [x] 3.3 Implement `db/` — global `DbModule` providing the postgres client via `ConfigService` and the `DB` token, `tx-context.ts` (`txContext` AsyncLocalStorage, `currentExecutor`, `onCommit`), and `UnitOfWork.withTransaction` (nested calls join the caller's tx; onCommit hooks flush only after COMMIT); `onModuleDestroy` ends the pool
- [x] 3.4 Implement `common/errors/` — `AppException(code, message, details[])` base + `ValidationError`, `UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `StateConflictError`, `BusinessRuleError`, `ReauthRequiredError`; `AllExceptionsFilter` mapping code→HTTP, `ZodError`→400 with `details[]`, PG `23505`→409, `HttpException` by status, unknown→500 `INTERNAL` (logged, scrubbed) — output always `{ code, message, details }`
- [x] 3.5 Implement `common/concurrency/if-match.ts` (`parseIfMatch`, `assertVersion` → 409 `STATE_CONFLICT` on stale) and `common/pagination/cursor.ts` (`buildPage` using the `@erp/utils` cursor codec)
- [x] 3.6 Implement `events/` — `DomainEvent` envelope + `makeEvent` (correlation_id defaults from the current tx), `EventBusService` with `publishInTransaction` (awaited `emitAsync` inside the tx) and `publishAfterCommit` (onCommit hook), and `events.module.ts` with `EventEmitterModule.forRoot({ wildcard: true, delimiter: "." })`
- [x] 3.7 Implement `auth/` services and seams — `PasswordService` (argon2id), `TokenService` (access `{ sub, sid, pv }`, refresh `{ sub, sid }`, secrets/TTL from config), `auth.tokens.ts` DI seams (`USER_LOOKUP`, `SESSION_LOOKUP`, `PERMISSION_RESOLVER`) with `auth.defaults.ts` implementations querying the platform tables (default resolver returns the empty set)
- [x] 3.8 Implement `auth/` guards and decorators — `JwtGuard` (verify JWT → session not revoked/expired → user ACTIVE → `permissionsVersion === claims.pv` else 401 → resolve permissions → attach `AuthUser`), `PermissionsGuard` (`@Permissions()` metadata, super-admin bypass), `authz.ts` `assertPermissions` for in-handler ts-rest checks, `@Public()`/`@Permissions()`/`@CurrentUser()` decorators, global `auth.module.ts`; mark `HealthController` and demo `InvoiceController` `@Public()` at class level
- [x] 3.9 Implement `audit/` — `AuditService.record(entry)` + `requireReason` (422 on blank), `AuditSubscriber` on `@OnEvent("**")` writing `audit_log` rows via `currentExecutor` (same tx) for payloads carrying an `audit` block, global module
- [x] 3.10 Implement `sequence/` — `SequenceService.next(key)` in `uow.withTransaction` with `SELECT ... FOR UPDATE`, yearly reset (bump `yearScope`, reset `currentValue`), and format rendering (`{prefix}`, `{yyyy}`, `{seq:0000}` pad, bare `{seq}` uses row padding), global module
- [x] 3.11 Implement `common/idempotency/` — `IdempotencyService` (persist first response, replay stored response on repeat, reject same key with different `requestHash`, expire records) + `IdempotencyInterceptor` + module
- [x] 3.12 Implement `queue/` — `queue.constants.ts`, `QueueModule` (`BullModule.forRootAsync` with `maxRetriesPerRequest: null`, registered queues `email`/`line`/`pdf`/`mv-refresh`/`default`, `DEFAULT_JOB_OPTIONS` attempts:5 exponential, `removeOnComplete: 1000`, `removeOnFail: false`), and `BaseWorker` (extends `WorkerHost`, logs around `handle()`, subclasses idempotent on `(event, correlation_id)`)
- [x] 3.13 Implement `storage/` (`StorageService`: S3 v3 client with `forcePathStyle`, `put`/`getSignedUrl`/`delete`), `pdf/` (`PdfService`: lazy shared puppeteer browser `--no-sandbox`, `renderHtml`, close on destroy), and `realtime/` (`RealtimeGateway`: JWT handshake via `auth.token` or bearer, `joinRoom`/`emitToRoom`) with their modules
- [x] 3.14 Wire `app.module.ts` (all infra modules; `APP_FILTER` AllExceptionsFilter, `APP_GUARD` JwtGuard then PermissionsGuard in that order, `APP_INTERCEPTOR` IdempotencyInterceptor) and `main.ts` (`reflect-metadata` first, `enableShutdownHooks()`, log `API_PREFIX`)
- [x] 3.15 Verify: `pnpm build && pnpm typecheck && pnpm lint` green; API boots and maps routes at `/api/v1`

## 4. Infra / devcontainer

- [x] 4.1 Add `redis:7-alpine` (healthcheck `redis-cli ping`, volume `erp-redisdata`) and `minio` (root user/pass, ports 9000/9001, healthcheck `mc ready local`, volume `erp-miniodata`) to `infra/docker-compose.yml`
- [x] 4.2 Add the same `redis` + `minio` services (with healthchecks) to `.devcontainer/docker-compose.yml` on the `erp` network, add them to `app.depends_on` with `service_healthy`, and add env vars `REDIS_URL`, `S3_*`, `S3_FORCE_PATH_STYLE`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- [x] 4.3 Add puppeteer's Chromium runtime libs (`libnss3`, `libatk-bridge2.0-0`, `libgbm1`, `libasound2`, `fonts-liberation`, ...) to `.devcontainer/Dockerfile`
- [x] 4.4 Confirm the API boots in the devcontainer with all env vars validated by `env.schema.ts` (fail-fast on a missing var) — verified 2026-07-07: boots cleanly against the devcontainer's postgres/redis/minio services (`/api/v1/health` → 200); missing/malformed vars abort at `ConfigModule.forRoot` before any provider wires, exit 1, listing every failing field

## 5. Tests

- [x] 5.1 Add `apps/api/vitest.config.ts` with `unplugin-swc` (decorator metadata), `include: ["src/**/*.spec.ts", "test/**/*.spec.ts"]`, `pool: "forks"`; add `tsconfig.build.json` excluding `**/*.spec.ts`, `test`, `vitest.config.ts` so `nest build` keeps specs out of `dist` while `tsc --noEmit` still typechecks them
- [x] 5.2 Unit tests: cursor codec round-trip + malformed-cursor rejection, and `buildPage` pagination shape
- [x] 5.3 Unit tests: `parseIfMatch` / `assertVersion` (stale → `StateConflictError`) and `SequenceService` format rendering (`{prefix}`, `{yyyy}`, `{seq:0000}`, bare `{seq}` padding)
- [x] 5.4 Unit tests: `AllExceptionsFilter` code→HTTP map, `ZodError`→400 with details, PG `23505`→409, unknown→scrubbed 500
- [x] 5.5 Unit test: enum parity (`expectTypeOf`) between `@erp/contracts` enums and `@erp/db/schema/enums.ts`
- [x] 5.6 Integration tests (Testcontainers, gated on `DATABASE_URL_TEST` with `describe.skip` otherwise): sequence uniqueness under concurrent `next(key)` calls, and audit append-only (UPDATE/DELETE rejected by trigger)
- [x] 5.7 CI runs the unit vitest under the affected-only turbo filter; a dedicated `integration` job runs `test:integration` (Testcontainers provides Postgres — no `services:` block, per the confirmed decision). `pnpm test` green locally (integration skips without `DATABASE_URL_TEST`)

## 6. Verification

- [x] 6.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` all green from the repo root
- [x] 6.2 `pnpm db:generate` produces no diff (schema unchanged); `pnpm db:migrate` runs cleanly (verified against a fresh DB during the integration harness bring-up)
- [x] 6.3 Boot via `pnpm dev` and confirm `/api/v1/health` returns 200 without a token and a guarded route returns 401 without a token, both with the uniform `{ code, message, details }` error shape on failure — verified 2026-07-07 against a live boot: health→200 no token; a temporary guarded route→401 `UNAUTHENTICATED` (no token / garbage token), valid token→200. No shipping guarded route exists yet (both controllers are `@Public`), so this was driven via a throwaway `_verify` controller wired into the real AppModule, then reverted
- [x] 6.4 Confirm instant revocation: bump a user's `permissions_version` and observe 401 on the next request with the old token — verified 2026-07-07: seeded super-admin + session, old token→200; after `permissions_version` 1→2 the same token→401 `UNAUTHENTICATED` (guard asserts `user.permissionsVersion === claims.pv`)
- [x] 6.5 Confirm 409 `STATE_CONFLICT` on a stale `If-Match` write and a stored-response replay on a repeated `Idempotency-Key` — verified 2026-07-07: `If-Match: 1`(current)→200, stale `If-Match: 2` & malformed→409 `STATE_CONFLICT`; repeated `Idempotency-Key` replayed the stored response with identical server nonce + `X-Idempotent-Replay: true`, and key-reuse with a different body→409. Driven via the same temporary guarded `_verify` route (mutating + authenticated, which the global `IdempotencyInterceptor` requires), then reverted
- [x] 6.6 Confirm document sequence uniqueness under concurrent load (no duplicate numbers) — covered by the `sequence.int.spec.ts` integration test (50-way concurrency, verified against real Postgres)
