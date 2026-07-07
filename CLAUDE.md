# CLAUDE.md

Guidance for working in this repository.

## What this is

Integrated Manufacturing & Sales **ERP**, built as a **pnpm + Turborepo monorepo**.
Backend and frontend are both TypeScript and share a single source-of-truth contract
package, so cross-stack changes are atomic and type-checked end-to-end.

- Architecture spec: [`docs/MONOREPO_SPEC.md`](docs/MONOREPO_SPEC.md)
- What was built & why (decisions/deviations): [`docs/MONOREPO_IMPLEMENTATION_PLAN.md`](docs/MONOREPO_IMPLEMENTATION_PLAN.md)
- Domain spec: `docs/ERP_Implementation_Spec_v1.0.docx`

Current state: **runnable skeleton with foundation in place** — apps run and are wired
through one contract. The `@erp/db` persistence layer (platform schema + real
migrations/seed) and the `apps/api` cross-cutting infrastructure (config, DbModule +
UnitOfWork, uniform errors, auth + guards, events, audit, sequencing, idempotency,
queue/storage/pdf/realtime) are implemented. The demo invoice endpoints still use an
in-memory store — real repositories land with the business modules (M1–M6).

## Layout

```
apps/api/            NestJS — implements the @erp/contracts router via @ts-rest/nest
apps/web/            Vite + React + Ant Design — consumes the same contract (typed client)
packages/contracts/  ★ source of truth: zod schemas + ts-rest contracts + enums + permissions
packages/config/     shared tsconfig base + ESLint preset (dependency-boundary rules)
packages/utils/      framework-agnostic helpers (decimal money/qty)
packages/db/         drizzle schema + Postgres client + migrate/seed (no Nest/contracts)
packages/design-tokens/ Style Dictionary token source → tokens.css + Tailwind v4 preset (no framework)
infra/               docker-compose.yml (dev Postgres only)
tooling/             db migrate/seed/codegen scripts (placeholder)
```

Internal packages are scoped `@erp/*`, `private: true`, linked via `workspace:*`.

## `@erp/design-tokens` — the token pipeline (M0 frontend)

Single source of truth for the **locked "Ink & Substrate" design system**
(`docs/PartA_Direction_Tokens_LOCKED.md` — that doc's hex/type/radius values win over the
older `docs/UX_UI_SPEC_M1-M6.md` A4/A5 proposals). Never hand-duplicate a token value in
component code or Tailwind config; edit the source and rebuild.

- **Source**: `src/tokens/*.ts` — plain Style Dictionary token tree (`primitives`, `semantic`
  light+dark+chips, `scale`, `density`). Semantic tokens *reference* primitives (`{cyan.700}`),
  which is why dark mode is a token swap only.
- **Build** (`src/build-tokens.ts`, run via `tsx`): a custom SD format emits one
  `dist/css/tokens.css` with `:root` (light) + `[data-theme="dark"]` + `[data-density="…"]`
  blocks + a reduced-motion collapse, plus a Tailwind v4 `@theme inline` preset
  (`dist/tailwind/preset.css`, JS shim `preset.js`) exposing **semantic names only** —
  primitives (`--ink-*`, `--cyan-*`, `--substrate-*`) are never in the preset (lint will also
  ban them in `@erp/ui`/`apps/web` styles, task 2).
- **Consume**: `@erp/design-tokens/css` (the CSS vars), `@erp/design-tokens/tailwind.css` (v4
  preset), `@erp/design-tokens/tailwind` (JS shim), and `@erp/design-tokens` (Ink-Chip
  glyph/label metadata + `THEMES`/`DENSITIES`). Theme/density are pure attribute flips.
- Framework-agnostic (ESLint-enforced `designTokensBoundaries`): no React/Nest/Tailwind/other
  `@erp/*` runtime deps, so `apps/api` can later take the token CSS for M5 PDF templates
  without pulling React. Regenerating drift is guarded by `src/build-tokens.spec.ts`.

**Wireframes** `docs/wireframes/*.html` are the visual reference for all frontend work.

## `apps/api` cross-cutting infrastructure (M0)

Every business module (M1–M6) inherits these — never reimplement them. See
`docs/plans/M0-foundation.md` §4 and `openspec/changes/m0-foundation/design.md`.

- `config/` — `env.schema.ts` zod-validates env at boot (fail-fast); global `ConfigModule`.
- `db/` — global `DbModule` (`DB` token from `@erp/db`'s `createDb`); `tx-context.ts`
  (`txContext` ALS, `currentExecutor(db)`, `onCommit`); `UnitOfWork.withTransaction`
  (nested calls join the caller's tx; onCommit hooks flush only after COMMIT). Run all
  writes through `currentExecutor(db)` so they honor the ambient transaction.
- `common/errors/` — throw `AppException` subclasses (`NotFoundError`, `StateConflictError`,
  `BusinessRuleError`, …); the global `AllExceptionsFilter` renders the uniform
  `{ code, message, details }` envelope. Never build error bodies in handlers.
- `common/concurrency/` (`assertVersion` for `If-Match`), `common/pagination/` (`buildPage`),
  `common/idempotency/` (interceptor + service).
- `auth/` — global `JwtGuard` (protected by default; `@Public()` **at class level** on
  ts-rest controllers) + `PermissionsGuard`. ts-rest endpoints authorize **in-handler**
  via `assertPermissions(user, "module.resource.action")` — the guards can't read
  method-level metadata on ts-rest handlers. M0's `PERMISSION_RESOLVER` returns the empty
  set (super-admins bypass); M1 rebinds that seam.
- `events/` — `EventBusService.publishInTransaction` (atomic, awaited in-tx) vs
  `publishAfterCommit` (deferred to onCommit). `audit/` writes append-only rows.
- `sequence/` — `SequenceService.next(key)` for race-safe document numbers.
- `queue/` (BullMQ), `storage/` (S3/MinIO), `pdf/` (puppeteer), `realtime/` (Socket.IO).

Requires `DATABASE_URL`, `REDIS_URL`, `JWT_*`, and `S3_*` env vars (validated by
`env.schema.ts`). Redis + MinIO dev services land with the M0-D test/infra work.

## Commands

Run from the repo root (Turbo handles ordering + caching):

```bash
pnpm install
pnpm dev          # api + web together (api :3000, web :5173, /api proxied)
pnpm build        # turbo build (contracts → utils → api/web)
pnpm typecheck
pnpm lint
pnpm test
pnpm db:migrate   # → apps/api (stub for now)

# single workspace
pnpm --filter @erp/api dev
pnpm --filter @erp/web build
pnpm --filter @erp/api add <pkg>   # add a dep to one workspace

# local Postgres
docker compose -f infra/docker-compose.yml up -d
```

Always verify changes with `pnpm build && pnpm typecheck && pnpm lint` before claiming done.

## Non-negotiable conventions

1. **`apps/web` and `apps/api` never import each other** — communicate only through
   `@erp/contracts`. Enforced by ESLint (`no-restricted-imports`); violating it fails CI.
2. **`@erp/contracts` stays framework-agnostic** — only `zod` / `@ts-rest/core` / `@erp/utils`.
   No React, no NestJS imports. Enforced by ESLint.
3. **Money & quantity cross the wire as strings**, never floats. Validate with the
   `moneyString` / `qtyString` zod schemas; do arithmetic with the `decimal.js` helpers in
   `@erp/utils` (`lineTotal`, `sumMoney`, `formatMoney`). Use `asMoney` / `asQty` to assert a
   computed string into the branded type at the boundary.
4. **Contracts are the source of truth.** Add/change an endpoint or shape in
   `packages/contracts/src/`, then implement it in `apps/api` and consume it in `apps/web`.
   A mismatch is a compile error in the same change — that's the point.

## Module system — important

The repo is **full ESM** (`"type": "module"` everywhere, TypeScript `module: NodeNext`).
Consequences to respect:

- **Relative imports need explicit `.js` extensions** in `.ts` source (e.g.
  `import { x } from "./foo.js"`), including in `apps/api`.
- Import `decimal.js` as a **named** import: `import { Decimal } from "decimal.js"` (the
  default import does not resolve under NodeNext).
- ESLint flat configs in ESM packages can be `eslint.config.js`; where a `.js` config would
  be ambiguous they are `eslint.config.mjs` — keep that.

## Gotchas

- **Typecheck uses `tsc --noEmit`, not `tsc --build --noEmit`** — the latter errors TS6310 on
  composite project references. Turbo already builds dependencies first via `dependsOn: ["^build"]`.
- **Stale incremental builds**: if `tsc`/`nest build` emits too few files after a config
  change, clear artifacts: `find . -name '*.tsbuildinfo' -delete` and remove the `dist/` dirs.
  (`apps/api` deliberately has no `incremental`/`composite` for this reason.)
- `dist/`, `node_modules/`, `.turbo/`, `*.tsbuildinfo` are git-ignored — never commit them.

## Toolchain

Node ≥ 22 (CI pins 22; verified locally on 26) + pnpm 9. Recent Node no longer bundles
Corepack, so install pnpm via `npm i -g pnpm@9` or a version manager.

## Conventions for changes

- Match the style of surrounding code.
- Commit/push or open PRs only when asked. If on `main`, branch first.
- CI runs affected-only (`turbo ... --filter=...[origin/main]`); keep tasks cacheable.
