# Monorepo Implementation Plan

Companion to [`MONOREPO_SPEC.md`](./MONOREPO_SPEC.md). The spec defines the target
architecture; this document records the **plan that was executed** to scaffold it
from zero, the decisions taken, deviations from the spec, and how it was verified.

| Field | Value |
|---|---|
| Status | Implemented (runnable skeleton) |
| Branch | `scaffold-monorepo` |
| Stack | pnpm 9 + Turborepo · NestJS (api) · Vite + React + Ant Design (web) · zod + ts-rest contracts |

---

## Context

The repository started empty (only `README.md` + the spec docs under `docs/`).
`MONOREPO_SPEC.md` is implementation-ready, so this plan translates its §12 "from
zero" steps into an ordered, executed build that produces a **runnable skeleton**:
minimal but actually-running `api` + `web` wired end-to-end through a single shared
contract, so `pnpm dev` works and a contract change fails compilation on both sides.

## Decisions taken

| Topic | Decision | Spec ref |
|---|---|---|
| Scaffold depth | Runnable skeleton (real, minimal apps + shared packages) | — |
| `packages/ui` | **Deferred** — `web` owns its components for now | MR-Q2 |
| Infra/IaC | **Dev Docker only** — `docker-compose` for local Postgres; no prod k8s/IaC here | MR-Q3 |
| Remote cache | **Local cache only** now; remote cache documented as a later toggle | MR-Q1 |
| Changesets | **Not now** — `workspace:*`, no publishing | §9 / MR-Q4 |

## Delivered layout

```
apps/api/            NestJS — health + invoice example, implements the @erp/contracts router
apps/web/            Vite + React + Ant Design — consumes the same contract, type-safe
packages/contracts/  ★ source of truth: zod + ts-rest — enums, permissions, money, dto
packages/config/     shared tsconfig base + ESLint preset (dependency-boundary rules)
packages/utils/      framework-agnostic helpers (decimal money/qty)
infra/               docker-compose.yml (dev Postgres only)
tooling/             placeholder (db migrate/seed/codegen)
.github/workflows/   ci.yml (affected-only lint/typecheck/test/build)
pnpm-workspace.yaml · turbo.json · package.json (root, private) · tsconfig.json · .npmrc
```

All internal packages are scoped `@erp/*`, `private: true`, linked with `workspace:*`.

## Build order (mirrors spec §12 — dependencies first)

1. **Root files** — `package.json` (scripts §4.4), `pnpm-workspace.yaml`, `.npmrc`,
   `turbo.json` (§8 tasks: `build`/`typecheck`/`test` depend on `^build`; `dev`
   non-cached + persistent), root `tsconfig.json`, `.gitignore`.
2. **`packages/config`** — `tsconfig.base.json` (§7) + ESLint flat preset carrying the
   §6 boundary rules (web↛api, api↛web, contracts↛React/Nest).
3. **`packages/utils`** — `decimal.js` money/qty helpers (string-on-wire, §5.3/§13).
4. **`packages/contracts`** — enums (routing status, doc/VAT types), permission catalog,
   branded `Money`/`Qty` zod schemas, and the Invoice + health ts-rest contracts.
5. **`apps/api`** — NestJS implementing the contracts via `@ts-rest/nest` (auto-validates).
6. **`apps/web`** — React page consuming the same contract via a typed
   `@ts-rest/react-query` client; Vite proxies `/api` → api on :3000.
7. **Boundaries + references** wired; each package's ESLint extends the shared preset.
8. **`infra/docker-compose.yml`** — single dev Postgres service.
9. **`.github/workflows/ci.yml`** — affected-only pipeline vs `origin/main`; remote
   cache left off (commented `TURBO_TOKEN`/`TURBO_TEAM` block for later).
10. **README** — §11 local-dev workflow.

## Deviations from the spec (and why)

- **Full ESM** across `contracts`/`utils`/`api` (NodeNext), not the spec's mixed assumption.
  Required so Vite/rollup can resolve named exports from the shared package — CommonJS
  barrel re-exports (`__exportStar`) defeat rollup's static named-export detection.
- **`asMoney` / `asQty` constructors** added in `@erp/contracts` as the explicit boundary
  for asserting an already-validated decimal string into the branded type (instead of casts).
- **Dependency boundaries** enforced with built-in ESLint `no-restricted-imports` keyed on
  `@erp/*` package names (rather than a path-based plugin) — robust regardless of disk layout.
- **Typecheck task** uses plain `tsc --noEmit` (not `tsc --build --noEmit`, which errors
  TS6310 on composite project references); Turbo already orders builds via `^build`.

## Conventions enforced (spec §6, §13)

- `apps/web` ↔ `apps/api` never import each other — communicate via `@erp/contracts`.
- `@erp/contracts` stays framework-agnostic (zod / ts-rest / `@erp/utils` only).
- Money/quantity cross the wire as **strings**; convert with `@erp/utils` (no float).
- Build order via `dependsOn: ["^build"]`; CI is affected-only vs `origin/main`.

## Verification performed

| Check | Result |
|---|---|
| `pnpm build` / `typecheck` / `lint` | All green; 2nd build = FULL TURBO cache hit |
| Boundary rule | A `web → @erp/api` import fails lint with the §6 message |
| Contract safety | Renaming `Invoice.total` in `@erp/contracts` breaks `apps/api` typecheck |
| Runtime — health | `GET /api/health` → `{ status: "ok", uptime: … }` |
| Runtime — create | `POST /api/invoices` computed `total: "361.5000"` (3 × 120.50 via decimal helper) |
| Runtime — validation | Invalid qty-scale and bad-UUID payloads rejected with HTTP 400 |

### Reproduce locally

```bash
pnpm install
pnpm build && pnpm typecheck && pnpm lint
pnpm --filter @erp/api build && PORT=3000 node apps/api/dist/main.js   # then curl /api/health
pnpm dev   # api + web together; web at http://localhost:5173
```

## Toolchain note

Spec assumes Node ≥ 22 + pnpm 9. The scaffold was verified on Node 26 (Homebrew) + pnpm
9.15; **CI pins Node 22** via `actions/setup-node`. Corepack is no longer bundled with
recent Node, so pnpm is installed via `npm i -g pnpm@9` (or a version manager).

## Follow-ups / out of scope

- Real DB schema, ORM choice, and migrations (currently a `db:migrate` stub).
- `packages/ui` shared component library (deferred — MR-Q2).
- Production Dockerfiles / k8s / IaC, Turborepo remote cache, changesets/publishing.
- Make `apps/web` reference invoice fields in a type-checked way so the contract-safety
  guarantee breaks **both** apps (today the web table's Ant Design `dataIndex` is loosely typed).
- Merge the repository-strategy decision into the main ERP spec as ADR-007 (spec §14).
```
