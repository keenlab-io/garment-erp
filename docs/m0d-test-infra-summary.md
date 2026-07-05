# M0-D · Test harness + infra/devcontainer

**Date**: 2026-07-05
**Branch**: `feature/m0d-test-infra`
**Issue**: [#7](https://github.com/keenlab-io/garment-erp/issues/7) (M0-D)
**Author**: Claude

## Overview

M0-D is the final slice of the M0 shared foundation. M0-A/B/C delivered the contracts,
the `@erp/db` persistence layer, and the `apps/api` cross-cutting infrastructure; this
change makes that foundation **verifiable and runnable**. It adds the repo's first real
test harness (Vitest + SWC, unit + gated Testcontainers integration), wires the runtime
services the app already expects (`redis`, `minio`) plus Puppeteer's Chromium libraries
into the dev infra, and runs the tests in CI.

Implements `openspec/changes/m0-foundation/tasks.md` §4 (infra/devcontainer), §5 (tests),
and §6 (verification).

## Changes

### New files
- `apps/api/vitest.config.ts` — base Vitest config; `unplugin-swc` emits the decorator
  metadata esbuild omits; `pool: "forks"`; v8 coverage; includes `src/**/*.spec.ts` and
  `test/**/*.spec.ts`.
- `apps/api/vitest.integration.config.ts` — extends the base and adds the Testcontainers
  `globalSetup`.
- `apps/api/tsconfig.build.json` — `nest build` config that excludes specs/`test`/vitest
  configs so `dist` stays clean (auto-detected by the Nest CLI). `tsconfig.json` was
  broadened to also typecheck `test/**` and the vitest configs.
- Unit specs: `src/common/pagination/cursor.spec.ts`, `src/common/concurrency/if-match.spec.ts`,
  `src/sequence/sequence.spec.ts`, `src/common/errors/all-exceptions.filter.spec.ts`,
  `src/enums.parity.spec.ts`.
- Integration harness: `test/integration/global-setup.ts` (Testcontainers Postgres +
  migrations), `test/integration/sequence.int.spec.ts`, `test/integration/audit.int.spec.ts`.

### Modified files
- `apps/api/package.json` — test devDeps (`vitest`, `@vitest/coverage-v8`, `unplugin-swc`,
  `@swc/core`, `supertest`, `@types/supertest`, `testcontainers`, `tsx`); `test` →
  `vitest run --coverage`; new `test:integration` → `vitest run --config vitest.integration.config.ts`.
- `apps/api/tsconfig.json` — broadened `include` to cover `test/**` + vitest configs;
  `rootDir` moved to `tsconfig.build.json`.
- `infra/docker-compose.yml` and `.devcontainer/docker-compose.yml` — add `redis:7-alpine`
  and `minio` services (healthchecks + volumes); devcontainer wires them into
  `app.depends_on` (`service_healthy`) and adds the `REDIS_URL` / `S3_*` / `JWT_*` env the
  app validates at boot.
- `.devcontainer/Dockerfile` — Chromium runtime libs for Puppeteer's PDF module.
- `.devcontainer/devcontainer.json` — forward ports 6379 / 9000 / 9001.
- `.github/workflows/ci.yml` — new `integration` job running `test:integration` against a
  Testcontainers Postgres.

> The `.devcontainer/docker-compose.yml` and `.devcontainer/Dockerfile` also carried
> pre-existing, unrelated working-tree edits (pnpm-store relocation + baking in Claude
> Code) that predate this branch; they ride along in the same files.

## Technical details

### Integration test strategy (confirmed decision)
Integration specs are gated with `describe.skipIf(!process.env.DATABASE_URL_TEST)`. Plain
`pnpm test` runs unit-only and the integration blocks skip. `pnpm --filter @erp/api
test:integration` runs a Vitest `globalSetup` that boots a throwaway Postgres via
Testcontainers, applies the committed `tooling/drizzle` migrations, and exports
`DATABASE_URL_TEST` — which propagates to the forked test workers, so the gated specs run.

CI therefore needs **no `services:` block**: the dedicated `integration` job gets its
Postgres from Testcontainers (Docker is available on `ubuntu-latest`). No redis/minio in
CI — no automated test consumes them (queue/storage are smoke-tested manually in the
devcontainer). This reconciles the plan's "Testcontainers" and "integration skips without
`DATABASE_URL_TEST`" requirements.

### Enum parity
`src/enums.parity.spec.ts` uses `expectTypeOf` to assert `@erp/contracts`
`UserStatus`/`AuditAction` are identical to `@erp/db`'s `schema/enums.ts` unions. It is
enforced at **typecheck** time (`tsc --noEmit`) — any drift fails the `typecheck` task.

## Testing

- Unit: 32 tests across 5 spec files, all green under `pnpm test`.
- Coverage on the units under test: `cursor.ts`, `if-match.ts`, `app-exception.ts` 100%;
  `all-exceptions.filter.ts` 100% lines / 85% branch. (Global coverage is low by design —
  the DI-wired modules/services are boot/integration surface, out of M0-D unit scope.)
- Integration: 3 tests (sequence 50-way concurrency uniqueness; audit UPDATE/DELETE
  rejection) — verified green against real Postgres. The Testcontainers boot path is
  exercised in CI (Docker unavailable in this workspace; the `globalSetup` env-propagation
  and the specs themselves were validated directly against a migrated Postgres).
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` all green; `pnpm db:generate`
  reports no schema diff.

## Not yet verified (need a full app boot with redis/minio)
- tasks.md 4.4 / 6.3 / 6.4 / 6.5 — devcontainer rebuild + `pnpm dev` smoke tests
  (health 200 / guarded 401 / instant revocation / stale `If-Match` / idempotent replay)
  and the manual queue+storage smoke. These require the running services and are deferred
  to a devcontainer rebuild.

## Related
- Plan: `docs/plans/M0-foundation.md` §5–§6
- OpenSpec change: `openspec/changes/m0-foundation/`
