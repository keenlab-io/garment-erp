# M0 — Shared Foundation

The cross-cutting backbone every module depends on: persistence, auth, events,
audit, sequencing, queues, realtime, storage, PDF, and the error/idempotency/
concurrency conventions from spec §0. Build this first and in the order in §8.

> Notes marked **✔ verified** were validated by building this layer end-to-end
> (migrations applied, API booted, unit + integration tests green). Treat them as
> known-correct rather than speculative.

---

## 0. Decisions

- **New package `@erp/db`** (framework-agnostic) holds the drizzle schema, client,
  and migration/seed runners. Rationale: drizzle-kit, the migrate/seed scripts,
  and integration tests must import the schema **without booting Nest**; `apps/api`
  wraps it in a thin `DbModule`. `@erp/db` depends only on `drizzle-orm` +
  `postgres` + `@erp/utils` (+ `argon2` for the seed). An ESLint boundary
  (`dbBoundaries`) bans importing `@erp/contracts`/`@nestjs/*` to avoid a cycle.
- **Postgres driver: `postgres` (postgres.js)** — ESM-native, first-class drizzle
  transactions, `numeric` returned as **strings** (matches the wire contract; no
  floats anywhere). ✔ verified
- **Transaction-scoped event handlers via `AsyncLocalStorage`.** `EventEmitter2`
  dispatch is synchronous, so in-tx handlers run in the same ALS frame and pick up
  the active `tx` automatically — no threading `tx` through payloads.
- **Storage: AWS SDK v3** (`@aws-sdk/client-s3` + `s3-request-presigner`) against
  MinIO via `endpoint` + `forcePathStyle: true`.
- **`/api/v1`** comes from the contract `pathPrefix` (no Nest global prefix). The
  web Vite proxy already matches `/api/*`. ✔ verified (routes mapped at `/api/v1`)
- **Tests: Vitest + `unplugin-swc`** (SWC emits decorator metadata that esbuild
  doesn't); integration via **Testcontainers**, gated on `DATABASE_URL_TEST`.

---

## 1. Dependencies

`apps/api` runtime: `drizzle-orm`, `postgres`, `@nestjs/config`,
`@nestjs/event-emitter`, `@nestjs/jwt`, `@nestjs/bullmq`, `bullmq`, `ioredis`,
`@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `argon2`,
`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `puppeteer`, `@erp/db`.
`apps/api` dev: `vitest`, `@vitest/coverage-v8`, `supertest`, `@types/supertest`,
`testcontainers`, `tsx`, `unplugin-swc`, `@swc/core`.
`@erp/db`: `drizzle-orm`, `postgres`, `@erp/utils`, `argon2`; dev `drizzle-kit`,
`@erp/config`, `@types/node`, `eslint`, `tsx`, `typescript`.
`@erp/utils`: add `@types/node` (the cursor codec uses `Buffer`; web tree-shakes
the unused codec so `Buffer` never reaches the browser bundle). ✔ verified
`@erp/contracts`: no new deps (new files only).

> Pin to NestJS-10-compatible majors (`@nestjs/config@^3`, `event-emitter@^2`,
> `jwt@^10`, `bullmq@^10`). Install with `pnpm --filter <pkg> add ...`.

---

## 2. `@erp/contracts` extensions

- `enums/error-code.ts`: `ErrorCode` const object + type + `isErrorCode`
  (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
  `STATE_CONFLICT`, `BUSINESS_RULE`, `REAUTH_REQUIRED`, `IDEMPOTENT_REPLAY`,
  `INTERNAL`). Shared by web + the api filter.
- `enums/iam.ts`: `UserStatus`, `AuditAction` (needed by the M0 audit layer; rest
  of IAM enums land in M1). Keep in sync with `@erp/db/schema/enums.ts`.
- `dto/_shared.ts`:
  - `export const API_PREFIX = "/api/v1"`
  - `uuid`, `paginationQuery` (`limit` coerced 1–100 default 50, optional `cursor`)
  - `paginated(item)` → `{ data: item[], next_cursor: string|null }`
  - `errorResponse` → `{ code, message, details: {field?, issue}[] }`
  - `jobAccepted` → `{ job_id }`
  - `idempotencyKeyHeader`, `ifMatchHeader`
  - `withErrors(responses)` merging 400/401/403/404/409/422 → `errorResponse`
- Switch `dto/health.ts` + `dto/invoice.ts` to `{ pathPrefix: API_PREFIX }` and
  wrap their `responses` in `withErrors(...)`.
- `permissions/catalog.ts`: extend `PERMISSIONS` with all module codes so
  `@Permissions(...)`/`assertPermissions(...)` typo-check (the M1–M6 plans list
  the codes; M0 just needs the array to compile).
- `@erp/utils`: add `cursor.ts` — `encodeCursor(payload)`/`decodeCursor(s)`
  (base64url JSON) + `tryDecodeCursor`.

---

## 3. `@erp/db` package

```
packages/db/
  drizzle.config.ts          # see "drizzle-kit gotcha" below
  src/
    index.ts                 # re-export client, base-columns, schema (+ as `schema`)
    client.ts                # createDb(url) -> { db, queryClient }; export Db, Tx
    base-columns.ts          # auditColumns, versionColumn, money/qty/rate, citext, notDeleted
    schema/
      index.ts               # re-export every table file (.js specifiers)
      enums.ts               # $type string-unions (UserStatus, AuditAction, ...)
      platform/{users,sessions,audit-log,document-sequence,idempotency-key}.ts
    migrate.ts               # postgres-js migrator against ../../tooling/drizzle
    seed/seed.ts             # idempotent dev seed (super-admin + base sequences)
```

### base columns

```ts
// imports: isNull + sql from "drizzle-orm"; customType/integer/numeric/timestamp/uuid
//          from "drizzle-orm/pg-core"  — NOTE: isNull is NOT in pg-core. ✔ verified
export const citext = customType<{ data: string }>({ dataType: () => "citext" });

export const auditColumns = {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid(),  // FK -> user(id) declared per-table to avoid users↔base cycle (R6)
  updatedBy: uuid(),
  deletedAt: timestamp({ withTimezone: true }),
};
export const versionColumn = { version: integer().notNull().default(0) };
export const money = (n?: string) => numeric(n ?? undefined, { precision: 18, scale: 4 });
export const qty   = (n?: string) => numeric(n ?? undefined, { precision: 18, scale: 6 });
export const rate  = (n?: string) => numeric(n ?? undefined, { precision: 9,  scale: 6 });
export const notDeleted = (deletedAt) => isNull(deletedAt);
```

Use `casing: "snake_case"` in BOTH `drizzle.config.ts` and the runtime
`drizzle(client, { schema, casing: "snake_case" })` so camelCase keys map to
snake_case columns. ✔ verified

### client

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
export function createDb(url: string, o?: { max?: number }) {
  const queryClient = postgres(url, { max: o?.max ?? 10 });
  return { db: drizzle(queryClient, { schema, casing: "snake_case" }), queryClient };
}
export type Db = ReturnType<typeof createDb>["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
```

### platform tables (M0 owns; modules extend, never redefine)

- `user` — minimal: `username`/`email` (citext, unique), `passwordHash`, `status`
  (`$type<UserStatus>` default `PENDING`), `permissionsVersion` (default 1),
  `isSuperAdmin`, `failedLoginCount`, `lockedUntil`, `lastLoginAt`, + audit +
  version. (M1 adds `employeeId` + roles/permissions.)
- `session` — `userId` FK, `tokenId` (jti), `permissionsVersion` snapshot, `ip`
  (inet), `userAgent`, `expiresAt`, `revokedAt`; partial index
  `WHERE revoked_at IS NULL`.
- `audit_log` — spec §1.2; INSERT-only (enforced by trigger, see below).
- `document_sequence` — spec §0.6; `unique(key, year_scope)`. **Single row per
  key** (rollover updates that row's `year_scope`), so `SELECT ... WHERE key=$`
  returns exactly one row. ✔ verified
- `idempotency_key` — PK `(key, user_id)`, `requestHash`, `responseStatus`,
  `responseBody jsonb`, `expiresAt`.

### migrations (drizzle-kit gotcha — ✔ verified)

drizzle-kit's loader can't resolve our `.js` ESM import specifiers against `.ts`
source. **Point `schema` at the compiled output** and build first:

```ts
// drizzle.config.ts
export default defineConfig({
  dialect: "postgresql",
  schema: "./dist/schema/index.js",       // built output, not src
  out: "../../tooling/drizzle",           // commit migrations at repo root
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://erp:erp@localhost:5432/erp" },
});
```
`db:generate` = `tsc --build && drizzle-kit generate`.

Then hand-edit two things drizzle-kit can't emit:
1. Prepend to `0000`: `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` and
   `CREATE EXTENSION IF NOT EXISTS "citext";` (citext/`gen_random_uuid()`).
2. A custom migration (`drizzle-kit generate --custom --name=audit_append_only`)
   enforcing append-only via a **trigger** (works even for the table owner, which
   a plain `REVOKE` does not in the single-role dev setup): ✔ verified rejects
   UPDATE/DELETE
   ```sql
   CREATE FUNCTION audit_log_no_mutate() RETURNS trigger AS $$
   BEGIN RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP; END;
   $$ LANGUAGE plpgsql;
   CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON "audit_log"
     FOR EACH ROW EXECUTE FUNCTION audit_log_no_mutate();
   ```
   (Production should additionally use a dedicated non-owner app role.)

`migrate.ts` resolves `../../../tooling/drizzle` from `dist` and runs the
postgres-js migrator. `seed/seed.ts` is idempotent (upsert super-admin via
argon2id; `onConflictDoNothing` the base `document_sequence` rows).

### scripts

`@erp/db`: `db:generate` (`tsc --build && drizzle-kit generate`), `db:migrate`
(`tsx src/migrate.ts`), `db:seed`, `db:studio`.
`apps/api` `db:migrate` → `pnpm --filter @erp/db db:migrate`.
root `db:generate`/`db:migrate`/`db:seed`/`db:studio` → `pnpm --filter @erp/db …`.
`turbo.json`: add `db:*` as `cache:false` (studio also `persistent`).

---

## 4. NestJS cross-cutting building blocks (`apps/api/src/`)

```
config/    env.schema.ts (zod validate), config.module.ts (global)
db/        db.module.ts (global, DB token), db.tokens.ts, tx-context.ts, unit-of-work.service.ts
common/
  errors/      app-exception.ts (+ subclasses), all-exceptions.filter.ts
  pagination/  cursor.ts (buildPage), concurrency/ if-match.ts
  idempotency/ idempotency.service.ts, idempotency.interceptor.ts, idempotency.module.ts
  decorators/  public, permissions, current-user
auth/      auth-user.ts, auth.tokens.ts (seams), auth.defaults.ts, jwt.guard.ts,
           permissions.guard.ts, authz.ts (assertPermissions), token.service.ts,
           password.service.ts, auth.module.ts (global)
events/    domain-event.ts, event-bus.service.ts, events.module.ts (global)
audit/     audit.service.ts, audit.subscriber.ts, audit.module.ts (global)
sequence/  sequence.service.ts, sequence.module.ts (global)
queue/     queue.constants.ts, queue.module.ts (global), base.worker.ts
storage/   storage.service.ts, storage.module.ts (global)
pdf/       pdf.service.ts, pdf.module.ts (global)
realtime/  realtime.gateway.ts, realtime.module.ts (global)
```

### DB + UnitOfWork

`DbModule` (global) provides the postgres client via `ConfigService`, the `DB`
token, and `UnitOfWork`; `onModuleDestroy` ends the pool.

```ts
// tx-context.ts
export interface TxStore { tx: Tx; onCommit: Array<() => Promise<void>>; correlationId: string }
export const txContext = new AsyncLocalStorage<TxStore>();
export const currentExecutor = (db: Db) => txContext.getStore()?.tx ?? db;
export const onCommit = (fn) => { const s = txContext.getStore(); s ? s.onCommit.push(fn) : void fn(); };

// unit-of-work.service.ts — opens a tx, publishes it into ALS, flushes onCommit AFTER commit
async withTransaction(fn) {
  const existing = txContext.getStore();
  if (existing) return fn(existing.tx);          // nested → join caller's tx
  const hooks = []; const correlationId = randomUUID();
  const result = await this.db.transaction(tx =>
    txContext.run({ tx, onCommit: hooks, correlationId }, () => fn(tx)));
  for (const h of hooks) await h();              // async dispatch only after COMMIT
  return result;
}
```

### Errors

`AppException(code, message, details[])` base + `ValidationError`,
`UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `StateConflictError`
(409), `BusinessRuleError` (422), `ReauthRequiredError`. `AllExceptionsFilter`
(`APP_FILTER`) maps `code → HTTP`, serializes `ZodError → 400` with `details[]`,
PG `23505 → 409`, `HttpException` by status, unknown `→ 500 INTERNAL` (logged,
scrubbed). Output is always `{ code, message, details }`. ✔ verified shape +
status map via unit tests.

### Auth

- `PasswordService` (argon2id hash/verify, never logs). `TokenService` (JWT access
  carries `{ sub, sid, pv }`; refresh `{ sub, sid }`; secrets/TTL from config).
- Seams in `auth.tokens.ts`: `USER_LOOKUP`, `SESSION_LOOKUP`, `PERMISSION_RESOLVER`
  with default impls (`auth.defaults.ts`) that query the platform tables. **M1
  rebinds `PERMISSION_RESOLVER`** to the role→permission union — M0's default
  returns an empty set (super-admins bypass), so M0 finalizes without M1.
- `JwtGuard` (global `APP_GUARD`, opt out `@Public()`): verify JWT → load session
  (reject if revoked/expired) → load user (reject if not `ACTIVE`) → assert
  `user.permissionsVersion === claims.pv` (**mismatch → 401 = instant
  revocation**) → resolve permissions → attach `AuthUser` to `request.user`.
- `PermissionsGuard` (`APP_GUARD`, after Jwt): enforces `@Permissions()` metadata
  for plain controllers (super-admin bypass).

> **✔ verified ts-rest authz gotcha.** ts-rest wraps the handler method, so the
> guard's `Reflector` does **not** see **method-level** `@Public()`/`@Permissions`
> metadata — only **class-level**. And one `@TsRestHandler` method serves multiple
> logical endpoints. So: put `@Public()` at the **class** level, and authorize
> each ts-rest endpoint **inside the handler** with
> `assertPermissions(user, "module.resource.action")` (from `auth/authz.ts`)
> rather than relying on the decorator. `@Permissions()` stays usable on plain
> (non-ts-rest) controllers.

### Events + Audit

`DomainEvent` envelope `{ event, version, occurred_at, actor_user_id, payload,
correlation_id }` (`makeEvent` defaults `correlation_id` to the current tx's).
`EventBusService`:
- `publishInTransaction(env)` → `await emitter.emitAsync(...)` — awaited inside the
  tx so a throwing handler rolls the mutation back (audit/backflush atomicity).
- `publishAfterCommit(env)` → `onCommit(() => emitter.emitAsync(...))` — async
  consumers (which enqueue BullMQ) never see uncommitted state.

`EventEmitterModule.forRoot({ wildcard: true, delimiter: "." })`. `AuditSubscriber`
(`@OnEvent("**")`) writes an `audit_log` row for any event whose payload carries an
`audit` block, via `currentExecutor` (same tx). `AuditService.record(entry)` for
direct use; `requireReason(reason)` throws 422 if blank (stock adjustment, void,
permission change, payroll approval).

> M0 baseline uses after-commit dispatch (not crash-safe between COMMIT and
> enqueue). The **transactional outbox table + relay** is the documented M1
> reliability upgrade.

### SequenceService (✔ verified zero-dup under 50-way concurrency)

`next(key)` runs in `uow.withTransaction`: `SELECT ... FOR UPDATE` the single
`document_sequence` row; if `resetYearly` and the year changed, reset
`currentValue=1` and bump `yearScope`; else increment; render `format`
(`{prefix}`, `{yyyy}`, `{seq:0000}` pad — bare `{seq}` uses the row's `padding`).

### Queue / Storage / PDF / Realtime

- `QueueModule`: `BullModule.forRootAsync` (Redis from config, **connection
  `maxRetriesPerRequest: null`**), `registerQueue` for `email`/`line`/`pdf`/
  `mv-refresh`/`default`; `DEFAULT_JOB_OPTIONS` = `attempts:5` exponential backoff,
  `removeOnComplete:1000`, `removeOnFail:false` (dead-letter). `BaseWorker`
  (extends `WorkerHost`) wraps `handle()` with logging; subclasses are idempotent
  on `(event, correlation_id)`.
- `StorageService`: S3 v3 client (`forcePathStyle` for MinIO), `put`/`getSignedUrl`
  /`delete`.
- `PdfService`: lazy shared puppeteer `Browser` (`--no-sandbox`), `renderHtml`;
  run only inside the `pdf` worker; `onModuleDestroy` closes the browser.
- `RealtimeGateway`: `@WebSocketGateway`, JWT handshake (`auth.token` or bearer),
  `joinRoom`/`emitToRoom`; M4 rooms `wo:{id}` and `timeline`.

### Wiring

`app.module.ts` imports all infra modules (Config/Db/Auth/Events are `@Global`).
Providers: `APP_FILTER` (AllExceptionsFilter), `APP_GUARD` (JwtGuard then
PermissionsGuard — order matters), `APP_INTERCEPTOR` (IdempotencyInterceptor).
`main.ts`: keep `reflect-metadata` first; `enableShutdownHooks()`; log
`${API_PREFIX}`. Mark `HealthController` (and the demo `InvoiceController` until
M5) `@Public()` at the **class** level. ✔ verified health is public, others 401.

---

## 5. Infra / devcontainer

- `infra/docker-compose.yml`: add `redis:7-alpine` (healthcheck `redis-cli ping`,
  volume `erp-redisdata`) and `minio` (root user/pass, ports 9000/9001,
  healthcheck `mc ready local`, volume `erp-miniodata`).
- `.devcontainer/docker-compose.yml`: same `redis`+`minio` services on the `erp`
  network with healthchecks; add to `app.depends_on` (`service_healthy`); add env
  `REDIS_URL`, `S3_*`, `S3_FORCE_PATH_STYLE`, `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`.
- `.devcontainer/Dockerfile`: add puppeteer's Chromium runtime libs
  (`libnss3 libatk-bridge2.0-0 libgbm1 libasound2 fonts-liberation …`). Puppeteer
  downloads its own Chromium on install; these are the shared libs it links.
- `apps/api/src/config/env.schema.ts`: zod-validate `DATABASE_URL`, `REDIS_URL`,
  `JWT_*`, `S3_*` at boot (fail fast).

---

## 6. Tests (✔ harness verified: 20 unit pass, 2 integration pass on real PG)

- `apps/api/vitest.config.ts` with `unplugin-swc` (decorator metadata),
  `include: ["src/**/*.spec.ts","test/**/*.spec.ts"]`, `pool: "forks"`.
- Add `apps/api/tsconfig.build.json` (extends `tsconfig.json`, excludes
  `**/*.spec.ts`, `test`, `vitest.config.ts`) so `nest build` keeps specs out of
  `dist`; `tsc --noEmit` still typechecks specs.
- Unit: cursor codec + `buildPage`; `assertVersion`/`parseIfMatch`; sequence
  `render`; the error filter `code→HTTP`+ZodError/`23505` map; enum parity
  (`expectTypeOf`) between `@erp/contracts` and `@erp/db`.
- Integration (Testcontainers; gated `DATABASE_URL_TEST`, `describe.skip` else):
  sequence uniqueness under concurrency; audit append-only (UPDATE/DELETE
  rejected). CI provides a `services: postgres/redis` block.

---

## 7. Risks / gotchas (all ✔ verified during build unless noted)

- `.js` ESM specifiers everywhere; drizzle-kit `schema` points at `dist` (§3).
- `isNull` imports from `drizzle-orm`, not `drizzle-orm/pg-core`.
- `@erp/utils` needs `@types/node` for `Buffer`.
- BullMQ connection requires `maxRetriesPerRequest: null`; `ioredis`/`puppeteer`
  are default imports; AWS SDK needs a region even for MinIO.
- users↔base-columns cycle: declare `created_by/updated_by` FKs per-table, not in
  `auditColumns`.
- `@erp/db` must not import `@erp/contracts`; duplicate enums as `$type` unions and
  unit-test parity (`expectTypeOf`).
- `tsc --noEmit` for typecheck (not `--build`); clear stale `*.tsbuildinfo`/`dist`
  if emits go wrong.
- **ts-rest method-metadata** — use class-level `@Public()` and in-handler
  `assertPermissions` (§4 Auth).
- After-commit dispatch isn't crash-safe → outbox is the M1 upgrade (not verified;
  by design).
- Mark `health` (+ demo invoice) `@Public()` or you lock yourself out at boot.

---

## 8. Build sequence (each step keeps build/typecheck/lint green)

A. `@erp/utils` cursor (+ `@types/node`) → `@erp/contracts` (`error-code`, `iam`
   enums, `_shared`, `API_PREFIX`, catalog) → verify.
B. Scaffold `@erp/db` (config, base-columns, platform schema, client, index) →
   `db:generate` → hand-edit `0000` extensions + audit append-only trigger →
   `db:migrate` + `db:seed` against dev PG → verify.
C. Nest infra in dependency order: config → db (DbModule/UnitOfWork/tx-context) →
   common/errors(+filter) → concurrency + pagination → events → auth(+guards,
   `@Public` health/login) → audit → sequence → idempotency(+interceptor) → queue
   → storage/pdf/realtime (independent) → wire `app.module`/`main` → verify build +
   boot.
D. Vitest + SWC + `tsconfig.build.json`, unit + integration tests; update
   `infra`/`.devcontainer`/Dockerfile/CI.

## Verification

`pnpm build && pnpm typecheck && pnpm lint && pnpm test`. `pnpm db:generate`
clean; `pnpm db:migrate` + `pnpm db:seed` against dev PG. Boot (`pnpm dev`),
confirm: `/api/v1/health` 200 (public), a guarded route 401 without a token,
uniform error shape, 401 after a `permissions_version` bump, 409 on stale
`If-Match`, replay on a repeated `Idempotency-Key`, sequence uniqueness under
concurrent load.
