# @erp/db — persistence package + platform schema + migrations

**Date**: 2026-07-04
**Branch**: `feature/erp-db-package`
**Issue**: [#5](https://github.com/keenlab-io/garment-erp/issues/5) (M0-B) · tasks.md §2 (2.1–2.12)
**Author**: Claude

## Overview

Adds `@erp/db`, the framework-agnostic persistence package every business module
(M1–M6) depends on. It holds the drizzle schema, the Postgres client factory, shared
column builders, and the migration/seed runners. The package is importable without
booting NestJS (by drizzle-kit, the migrate/seed scripts, and future integration
tests) and is barred by an ESLint boundary from importing `@erp/contracts` or any
`@nestjs/*` package. Migrations were generated, applied to the dev Postgres, and the
seed proven idempotent.

Scope is task §2 only — the NestJS `DbModule`/`UnitOfWork`, `SequenceService`,
`AuditService`, and the unit/parity tests belong to tasks §3 and §5.

## Changes

### New package — `packages/db/`
- `package.json` — deps `drizzle-orm`, `postgres`, `@erp/utils`, `argon2`; dev
  `drizzle-kit`, `tsx`, `@erp/config`. Scripts `db:generate`/`db:migrate`/`db:seed`/`db:studio`.
- `tsconfig.json`, `eslint.config.mjs` (`[...base, dbBoundaries]`), `drizzle.config.ts`
  (schema points at compiled `dist/schema/index.js` — see below).
- `src/base-columns.ts` — `citext` custom type, `auditColumns`, `versionColumn`,
  `money`(18,4)/`qty`(18,6)/`rate`(9,6) numeric helpers, `notDeleted`.
- `src/schema/enums.ts` — `UserStatus`/`AuditAction` string-unions mirroring
  `@erp/contracts` (duplicated because the boundary bans importing contracts).
- `src/schema/platform/{users,sessions,audit-log,document-sequence,idempotency-key}.ts`
  and the `schema/index.ts` barrel.
- `src/client.ts` — `createDb(url)` → `{ db, queryClient }`, `Db`/`Tx` types.
- `src/index.ts` — public surface (client, base-columns, schema, `schema` namespace).
- `src/migrate.ts` (postgres-js migrator) and `src/seed/seed.ts` (idempotent).

### New migrations — `tooling/drizzle/`
- `0000_nostalgic_marvel_zombies.sql` — the five platform tables; hand-edited to
  prepend `CREATE EXTENSION pgcrypto` + `citext` before the tables that use them.
- `0001_audit_append_only.sql` — hand-written `audit_log_no_mutate()` trigger
  function + `BEFORE UPDATE OR DELETE` trigger.

### Modified
- `packages/config/eslint-preset.js` — new exported `dbBoundaries` rule.
- `apps/api/package.json` — `db:migrate` now delegates to `@erp/db` (was a stub).
- `package.json` (root) — `db:generate`/`db:migrate`/`db:seed`/`db:studio`.
- `turbo.json` — `db:*` tasks (`cache:false`; `db:studio` also `persistent`).

## Technical notes

- **drizzle-kit reads `dist`, not `.ts`** — its loader can't resolve our `.js` ESM
  specifiers against source, so `drizzle.config.ts` schema is `./dist/schema/index.js`
  and `db:generate` runs `tsc --build` first (M0 plan §3, D10).
- **`casing: "snake_case"`** is set in both `drizzle.config.ts` and the runtime
  `drizzle(...)` so camelCase keys map to snake_case columns consistently.
- **Self-referential FKs** — `user.createdBy`/`updatedBy` reference `user.id` and are
  declared on the table (not inside `auditColumns`) to avoid a users↔base cycle; the
  circular type is broken with an `AnyPgColumn` return annotation.
- **Append-only via trigger, not REVOKE** — a `BEFORE UPDATE OR DELETE` trigger binds
  even the table owner, which a plain REVOKE does not in the single-role dev setup.
- **Numbers as strings** — postgres.js returns `numeric` as strings, matching the
  money/qty wire contract; no floats in the persistence layer.

## Verification (all green)

- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` across the workspace.
- `pnpm --filter @erp/db db:generate` a second time → "No schema changes" (deterministic).
- `db:migrate` applies both migrations to an empty dev Postgres; `db:seed` run twice
  succeeds with exactly one super-admin (argon2id hash) and 5 base sequences.
- Extensions `pgcrypto` + `citext` present; `session_active_token_idx` is partial on
  `revoked_at IS NULL`.
- Audit `INSERT` succeeds; `UPDATE`/`DELETE` both rejected by the trigger, row survives.
- citext: inserting `Ops@example.com` then `ops@example.com` is rejected by the unique
  constraint.
- The `dbBoundaries` ESLint rule fails lint on a temporarily-added `@erp/contracts`
  import.

## Related
- Plan: `docs/plans/M0-foundation.md` §3
- Specs: `openspec/changes/m0-foundation/specs/{persistence,audit-log,document-sequencing}/spec.md`
- Tasks: `openspec/changes/m0-foundation/tasks.md` §2
