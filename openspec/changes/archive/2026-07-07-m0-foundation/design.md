# M0 — Shared Foundation: Design

## Context

The monorepo is a runnable skeleton: `apps/api` (NestJS) and `apps/web` (Vite/React) are wired through `@erp/contracts`, but there is no database, no auth, and none of the cross-cutting conventions (uniform errors, idempotency, optimistic concurrency, audit, document numbering) that every business module M1–M6 assumes. See [`proposal.md`](./proposal.md) for motivation and the capability list; this document records how M0 is built and why this shape.

Constraints that drive the design:

- **Full ESM** (`"type": "module"`, TS `module: NodeNext`): relative imports need `.js` extensions, and several tools (drizzle-kit, esbuild-based test runners) mishandle this — worked around explicitly below.
- **Money/qty cross the wire as strings** (repo convention #3): the persistence layer must never surface floats.
- **Dependency boundaries are ESLint-enforced**: `@erp/contracts` stays framework-agnostic; apps never import each other. Any new package must fit this discipline.
- **M0 must finalize standalone**: M1 (IAM roles) does not exist yet, so authorization needs a seam M1 can rebind without M0 rework.

The engineering plan at `docs/plans/M0-foundation.md` is the detailed source; decisions marked ✔ there were verified end-to-end (migrations applied, API booted, unit + integration tests green). This document distills the architectural choices and their alternatives.

## Goals / Non-Goals

**Goals:**

- One framework-agnostic persistence package (`@erp/db`) that drizzle-kit, migration/seed scripts, integration tests, and the API can all consume.
- Cross-cutting API conventions (errors, idempotency, `If-Match` concurrency, cursor pagination) enforced centrally — modules inherit them, never reimplement them.
- Auth with instant revocation, and an authorization seam that M1 rebinds to roles without touching M0 code.
- Domain events with two dispatch semantics (in-transaction atomic vs after-commit eventual) that don't require threading a `tx` handle through payloads.
- DB-enforced append-only audit and race-safe document sequencing.
- Shared infra services (queue, storage, PDF, realtime) behind small injectable services.
- A test harness (Vitest unit + Testcontainers integration) that runs in CI and the devcontainer.

**Non-Goals:**

- No business endpoints or domain tables — M1–M6 own those. M0 ships only platform tables (`user`, `session`, `audit_log`, `document_sequence`, `idempotency_key`).
- No role/permission model — M0 exposes the seam and the typed catalog; the role→permission union is M1.
- No transactional outbox — after-commit dispatch is the M0 baseline; the outbox relay is the documented M1 reliability upgrade.
- No production hardening of DB roles (dedicated non-owner app role) or API image size — tracked as open questions.
- No UI work beyond the existing demo endpoints adopting `/api/v1` and the error envelope.

## Decisions

### D1. New framework-agnostic package `@erp/db` (schema, client, migrate/seed)

drizzle-kit, the migrate/seed runners, and Testcontainers integration tests must all import the schema **without booting Nest**. Putting the schema in `apps/api` would force those tools through the Nest app (or duplicate the schema), and importing `@erp/contracts` from the schema would create a cycle once contracts reference DB-derived types. So `@erp/db` depends only on `drizzle-orm` + `postgres` + `@erp/utils` (+ `argon2` for the seed), and an ESLint boundary bans `@erp/contracts`/`@nestjs/*` imports. `apps/api` wraps it in a thin global `DbModule`.

*Alternative considered:* schema inside `apps/api` — rejected: cycle risk, and tooling can't run headless.

*Consequence:* enums needed by both sides (e.g. `UserStatus`, `AuditAction`) are duplicated as `$type` string-unions in `@erp/db/schema/enums.ts`, with an `expectTypeOf` parity unit test keeping them in lockstep with `@erp/contracts` (see R5).

### D2. Postgres driver: `postgres` (postgres.js), not `pg`

postgres.js is ESM-native (no CJS interop friction under NodeNext), has first-class drizzle transaction support, and returns `numeric` columns as **strings** — which matches the string money/qty wire contract exactly: no float ever exists between the DB and the client. ✔ verified.

*Alternative considered:* `node-postgres` (`pg`) — larger ecosystem, but CJS-first and requires custom type parsers to avoid float coercion; more configuration to reach the same safety.

### D3. Transaction context via `AsyncLocalStorage`; events via synchronous EventEmitter2

`UnitOfWork.withTransaction` opens a drizzle tx and publishes `{ tx, onCommit[], correlationId }` into an `AsyncLocalStorage` frame. Because EventEmitter2 dispatch is synchronous, any handler fired **inside** the transaction runs in the same ALS frame and picks up the active `tx` automatically via `currentExecutor(db)` — no threading `tx` through event payloads or method signatures. Nested `withTransaction` calls join the caller's tx.

Two dispatch semantics on `EventBusService`:

- `publishInTransaction(env)` — `await emitter.emitAsync(...)` inside the tx: a throwing handler rolls the mutation back (used for audit writes and other atomicity-critical consumers).
- `publishAfterCommit(env)` — registered as an `onCommit` hook, flushed only after COMMIT: async consumers (BullMQ enqueues, notifications) never observe uncommitted state.

*Alternative considered:* passing `tx` explicitly through payloads/DI — rejected as invasive and error-prone; or a message broker from day one — rejected as premature (see the outbox note in Risks).

### D4. `/api/v1` via contract `pathPrefix`, not a Nest global prefix

`API_PREFIX = "/api/v1"` lives in `@erp/contracts/dto/_shared.ts` and is applied as ts-rest `pathPrefix` on each contract. This keeps the prefix in the single source of truth (both web client and API derive it from the contract) and avoids double-prefixing with Nest's `setGlobalPrefix`. The existing Vite proxy already matches `/api/*`, so the web app needs no change. ✔ verified routes map at `/api/v1`.

### D5. Instant revocation via `permissions_version`, not a token blocklist

The JWT access token carries `{ sub, sid, pv }`. `JwtGuard` loads the user on every request anyway (to check `ACTIVE` status), so comparing `user.permissionsVersion === claims.pv` is free; a mismatch → 401, forcing re-auth. Revoking someone is a single column bump — no distributed blocklist, no Redis lookup, no token-scanning. Sessions are also server-side rows, so an individual session can be revoked independently.

*Alternative considered:* JTI blocklist in Redis — extra infrastructure and a cache-consistency problem, for the same effect.

### D6. Pluggable `PERMISSION_RESOLVER` seam; M0 default returns the empty set

`auth.tokens.ts` defines `USER_LOOKUP` / `SESSION_LOOKUP` / `PERMISSION_RESOLVER` DI tokens with defaults querying the platform tables. M0's default resolver returns an **empty permission set** — super-admins bypass, everyone else is denied on guarded endpoints. M1 rebinds `PERMISSION_RESOLVER` to the role→permission union without touching any M0 file. This is what lets M0 finalize standalone. The permission catalog in `@erp/contracts` already contains all module codes so `@Permissions(...)` / `assertPermissions(...)` typo-check across M1–M6.

### D7. Authorization inside ts-rest handlers, not method decorators

ts-rest wraps handler methods, so a guard's `Reflector` cannot see **method-level** `@Public()`/`@Permissions()` metadata — only class-level — and one `@TsRestHandler` method can serve multiple logical endpoints. ✔ verified. So: `@Public()` goes at the **class** level, and each ts-rest endpoint authorizes in-handler via `assertPermissions(user, "module.resource.action")`. `@Permissions()` remains usable on plain controllers.

### D8. Append-only audit via a DB trigger

A `BEFORE UPDATE OR DELETE` trigger on `audit_log` raises an exception, enforcing immutability **even for the table owner** — which a plain `REVOKE` cannot do in the single-role dev setup. ✔ verified rejects UPDATE/DELETE. Production should additionally use a dedicated non-owner app role (open question Q2). Shipped as a hand-written custom migration alongside the generated ones.

### D9. Document sequencing: single row per key + `SELECT … FOR UPDATE`

`document_sequence` keeps exactly **one row per key**; yearly rollover updates that row's `year_scope` in place (rather than inserting a new row per year), so `SELECT … WHERE key = $1 FOR UPDATE` always locks exactly one row. `SequenceService.next(key)` runs inside `UnitOfWork.withTransaction`, making numbering race-safe by row locking. ✔ verified zero duplicates under 50-way concurrency.

*Alternative considered:* Postgres sequences — no yearly reset or formatting; row-per-year — lock/lookup ambiguity at rollover.

### D10. drizzle-kit reads the compiled `dist`, not `.ts` source

drizzle-kit's loader cannot resolve our `.js` ESM import specifiers against `.ts` source, so `drizzle.config.ts` points `schema` at `./dist/schema/index.js` and `db:generate` is `tsc --build && drizzle-kit generate`. ✔ verified. Migrations are emitted to `tooling/drizzle` at the repo root and committed. Two things drizzle-kit can't emit are hand-edited: the `pgcrypto`/`citext` extensions prepended to `0000`, and the audit trigger as a `--custom` migration (D8).

### D11. Tests: Vitest + `unplugin-swc`; integration via Testcontainers

Vitest's default esbuild transform drops decorator metadata, which Nest DI requires — `unplugin-swc` emits it. Integration tests run against a real Postgres via Testcontainers, gated on `DATABASE_URL_TEST` (`describe.skip` otherwise) so unit runs stay dependency-free; CI provides `services: postgres/redis`. A separate `tsconfig.build.json` keeps specs out of `dist` while `tsc --noEmit` still typechecks them.

### D12. Column conventions as shared base-column helpers

`auditColumns` (uuid PK, created/updated/deleted timestamps, created_by/updated_by), `versionColumn`, and `money`/`qty`/`rate` numeric helpers (precision 18,4 / 18,6 / 9,6) live in `@erp/db/base-columns.ts`; every module table spreads them. `casing: "snake_case"` is set in **both** drizzle-kit config and the runtime client so camelCase keys map consistently. ✔ verified. Note: `created_by`/`updated_by` FKs are declared **per-table**, not inside `auditColumns` — see R3.

## Risks / Trade-offs

- **[After-commit dispatch is not crash-safe]** — a crash between COMMIT and the `onCommit` flush loses the enqueue. → Accepted for M0 (workers are idempotent on `(event, correlation_id)`, so replays are safe); the **transactional outbox table + relay** is the documented M1 upgrade and the event API (`publishAfterCommit`) is already shaped so only the internals change.
- **[ts-rest hides method metadata from guards]** — a method-level `@Permissions()` on a ts-rest handler silently never enforces. → Convention (D7): class-level `@Public()` only, in-handler `assertPermissions` for every ts-rest endpoint; verified by boot tests (health public, guarded routes 401).
- **[users ↔ base-columns FK cycle]** — `auditColumns.createdBy` referencing `user.id` from within the helper would make every table (including `user` itself) circularly depend on `user`. → Declare `created_by`/`updated_by` FKs per-table where needed; the helper only defines the columns.
- **[`@erp/db` cannot import `@erp/contracts`]** — enum definitions must exist on both sides and can drift. → Duplicate as `$type` string-unions in `@erp/db/schema/enums.ts` plus an `expectTypeOf` parity unit test that fails the build on drift.
- **[Stale incremental build artifacts]** — `tsbuildinfo`/`dist` staleness makes `tsc`/`nest build`/drizzle-kit (which reads `dist`, D10) misbehave after config changes. → Documented remedy (`find . -name '*.tsbuildinfo' -delete`, remove `dist/`); `apps/api` deliberately avoids `incremental`/`composite`; `db:generate` always rebuilds first.
- **[Lock-yourself-out at boot]** — the global `JwtGuard` guards everything, including `health`, before any login endpoint exists. → `HealthController` (and the demo `InvoiceController` until M5) marked `@Public()` at class level; boot verification asserts health is 200 and other routes 401.
- **[BullMQ/Redis misconfiguration]** — BullMQ requires `maxRetriesPerRequest: null` on the connection or workers fail obscurely. → Set centrally in `QueueModule.forRootAsync`; env (`REDIS_URL`, `S3_*`, `JWT_*`) is zod-validated at boot to fail fast.
- **[Trigger-based audit immutability is dev-grade]** — the owner can still `DROP TRIGGER`. → Acceptable for dev/single-role; production non-owner role tracked as Q2.

## Migration Plan

Pre-release skeleton: no data migration, no user impact. Deployment is the §8 build sequence from the plan, each step keeping `pnpm build && pnpm typecheck && pnpm lint` green:

1. **A — Shared code first**: `@erp/utils` cursor codec (+ `@types/node`), then `@erp/contracts` (`ErrorCode`/IAM enums, `_shared` DTO helpers, `API_PREFIX`, permission catalog; re-wrap `health`/`invoice` with prefix + `withErrors`).
2. **B — Persistence**: scaffold `@erp/db` (config, base columns, platform schema, client) → `db:generate` → hand-edit `0000` extensions + audit trigger migration → `db:migrate` + `db:seed` against dev Postgres.
3. **C — Nest infra in dependency order**: config → db (DbModule/UnitOfWork/tx-context) → errors + filter → concurrency + pagination → events → auth (guards, `@Public()` health) → audit → sequence → idempotency → queue → storage/pdf/realtime (independent) → wire `app.module`/`main` → verify boot.
4. **D — Tests + infra**: Vitest/SWC harness, unit + integration tests; add Redis + MinIO to `infra/docker-compose.yml` and the devcontainer (healthchecks, env vars, Chromium libs); update CI.

Acceptance: `pnpm build && typecheck && lint && test` green; `/api/v1/health` 200 public, guarded route 401; uniform error shape; 401 after `permissions_version` bump; 409 on stale `If-Match`; replay on repeated `Idempotency-Key`; sequence uniqueness under concurrent load.

**Rollback**: migrations are additive (new tables only) — drop the new tables or revert the branch; no existing behavior to restore beyond the demo endpoints' original paths.

## Open Questions

1. **Outbox timing** — the transactional outbox is slated for M1; confirm no M1 feature (e.g. notification fan-out) needs crash-safe dispatch earlier than the outbox lands.
2. **Production DB roles** — the audit trigger protects against app-level mutation, but production should run the API under a dedicated non-owner role with `REVOKE UPDATE/DELETE` on `audit_log`. Decide when a production environment is defined.
3. **Puppeteer footprint** — puppeteer + Chromium adds significant weight to the API image. Options when containerizing for production: a separate PDF worker image, `puppeteer-core` + system Chromium, or an external rendering service.
