# garment-erp

Integrated Manufacturing & Sales ERP — a **pnpm + Turborepo monorepo**.

See [`docs/MONOREPO_SPEC.md`](docs/MONOREPO_SPEC.md) for the full architecture spec.

## Layout

```
apps/
  api/        NestJS (Modular Monolith) — implements the @erp/contracts router
  web/        React + Vite + Ant Design — consumes the same contract, type-safe
packages/
  contracts/  ★ single source of truth: zod schemas + ts-rest contracts + enums
  config/     shared tsconfig base + ESLint preset (dependency-boundary rules)
  utils/      framework-agnostic helpers (decimal money/qty)
infra/        docker-compose for local Postgres (dev only)
tooling/      scripts (db migrate / seed / codegen) — placeholder
```

Packages are scoped `@erp/*` and linked with `workspace:*` (no publishing).

## Prerequisites

- **Node ≥ 22**
- **pnpm 9.x** — `corepack enable && corepack prepare pnpm@9 --activate`
- **Docker** (optional) — only to run the local Postgres

## Local dev

```bash
pnpm install              # resolve the workspace graph

docker compose -f infra/docker-compose.yml up -d   # local Postgres (optional)

pnpm dev                  # run api + web (and watch-build contracts)

# or a single workspace:
pnpm --filter @erp/api dev
pnpm --filter @erp/web dev
```

- web dev server: http://localhost:5173 (proxies `/api` → api on :3000)
- api: http://localhost:3000/api (e.g. `GET /api/health`)

Edit `@erp/contracts` and both api and web see the new types immediately — and
fail to compile in the same PR if they don't match.

## Common commands

```bash
pnpm build        # turbo build (contracts → utils → api/web, cached)
pnpm typecheck    # tsc across the graph
pnpm lint         # eslint incl. dependency-boundary rules
pnpm test         # turbo test
pnpm db:migrate   # → apps/api db:migrate (stub for now)

# add a dependency to one workspace
pnpm --filter @erp/api add <pkg>
pnpm --filter @erp/web add <pkg>
```

## Conventions (spec §6, §13)

- `apps/web` ↔ `apps/api` never import each other — communicate via `@erp/contracts`.
- `@erp/contracts` stays framework-agnostic (zod / ts-rest / `@erp/utils` only).
- Money/quantity cross the wire as **strings**; convert with `@erp/utils` (no float).

These boundaries are enforced by ESLint and fail CI.
