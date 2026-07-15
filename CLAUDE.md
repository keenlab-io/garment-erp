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

## `@erp/ui` — owned component layer + workbench (M0 frontend, Group 2)

The shared React component package (Radix + Tailwind, shadcn-style **owned source**) styled
**only** through the `@erp/design-tokens` semantic Tailwind preset. Group 2 shipped the scaffold
+ verification workbench; Group 3 shipped the **primitive inventory** (see below); Group 5 shipped
the **DataTable organism** (see below). Higher-level compositions land in later M0 groups. See
`openspec/changes/m0-frontend-foundation` §2–3, §5 and design D1/D2/D4/D10.

- **DataTable organism (Group 5)** lives in `src/components/data-table/` — `data-table.tsx` (the
  organism) + `columns.tsx` (typed column helpers) + `use-column-presets.ts` (localStorage presets)
  + the `.stories.tsx`/`.test.tsx` triad. Built on **TanStack Table** (headless, the package's first
  consumer) and rendered via a semantic `<table role="grid">`: sticky sortable header at `--z-sticky`
  (asc→desc→none), **cursor** Prev/Next pagination matching the contract `{ data, next_cursor }` shape
  (Next disables + end-of-list on `null`; the parent owns fetching — the table is **presentational**
  and emits intent), density-aware rows (`--density-row-h/-pad-x/-font`; **`density="touch"` hides
  `meta.secondary` columns**), row-action + magenta bulk-selection bar (`bg-spot`), roving-tabindex
  keyboard nav (arrows move the active row, space toggles), a columns popover with client-persisted
  save/reset presets, and skeleton/empty/error(+Retry) states. Column model: `textColumn`
  (`mono` renders link-ink doc ids), `moneyColumn`/`qtyColumn` (→ `MoneyCell`/`QtyCell`, right-aligned
  tabular), `statusColumn` (→ `InkChip`); `secondary`/`align` come from a `ColumnMeta` **module
  augmentation** (its type-param names must match the base verbatim or `tsc --build` errors TS2428).
  All user-facing strings are **`labels` props with English defaults** (i18n §7 not yet wired). Row
  actions/column menu use Radix `Popover` (already a dep) — no `dropdown-menu` dependency. The
  `density` prop is threaded by the app from `useDensity()` (a later §8 task), not read from context.

- **Primitives (Group 3)** live under `src/components/<name>/` — each as `<name>.tsx` +
  `<name>.stories.tsx` + `<name>.test.tsx`, re-exported from `src/index.ts`. Shipped: `Icon`
  (lucide, sized by `--density-icon`), `Button` (icon-only requires `aria-label` **at the type
  level**), `Input`/`Checkbox`/`RadioGroup`/`Switch`/`Select`/`Combobox`, `FormField` (auto-wires
  `id`/`aria-describedby`/`aria-invalid`), `InkChip` (the status signature — `ChipStatus` bridges
  `RoutingStatus` + design-only lifecycle/stock statuses via `routingStatusToChip`; **void = muted +
  strikethrough**, magenta `--chip-active-state`), `MoneyCell`/`QtyCell` (format via `@erp/utils`,
  string in — never a float), `Tooltip`/`Badge`/`Avatar`/`Skeleton`, the `ToastProvider`/`useToast`
  system (job-toast variant), `Dialog`/`ConfirmDialog` (consequence + required-reason + re-auth), and
  `Drawer`. Radix packages + `lucide-react` are dependencies; overlays layer via the `--z-*` tokens.
- Radix needs a few DOM APIs jsdom lacks — `vitest.setup.ts` polyfills `ResizeObserver`,
  `hasPointerCapture`, and `scrollIntoView`.

- **Consume the styles once**: `@erp/ui/styles.css` (Tailwind entry — imports `tailwindcss`, the
  token CSS, and the semantic preset) and `@erp/ui/fonts` (self-hosted `@fontsource` faces: Bai
  Jamjuree, IBM Plex Sans Thai, IBM Plex Mono). `@erp/ui` (barrel) exports `cn()`/`cva` plus every
  Group 3 primitive and its public types.
- **Semantic tokens only** — raw hex and primitive var names (`--ink-*`/`--cyan-*`/`--substrate-*`/
  `--magenta-*`) are **lint-banned** in `@erp/ui`/`apps/web` style strings via the new
  `styleTokenBoundaries` (a `no-restricted-syntax` regex rule) in `packages/config/eslint-preset.js`.
  `antd` is now banned **workspace-wide** (folded into `base` + every `banImports` boundary);
  `apps/web`'s two legacy antd imports are grandfathered with `eslint-disable` until task 8.2.
  `uiBoundaries` keeps `@erp/ui` presentational (no `apps/*`, no `@ts-rest/*`/`@tanstack` query
  clients, no router).
- **Two resolution modes** in one package: shipped source (`src/index.ts`, `lib/`, `fonts.ts`) is
  built by `tsc --build` under **NodeNext** → uses explicit `.js` relative specifiers and emits to
  `dist/`. Bundler-only source (`.storybook/`, `*.stories.tsx`, `src/showcase/**`) is typechecked
  by `tsconfig.storybook.json` under **Bundler** resolution and uses **extensionless** imports —
  it never enters `dist`. `pnpm typecheck` runs both configs.
- **Workbench**: `pnpm --filter @erp/ui storybook` (Storybook 10 + Vite, `@tailwindcss/vite` via
  `viteFinal`, `addon-a11y`). Toolbar switches theme × density × locale flip `data-theme` /
  `data-density` / `<html lang>`; `src/showcase/TokenMatrix.stories.tsx` proves the matrix
  re-resolves via tokens alone. Component tests: Vitest + Testing Library + jsdom (`vitest.config.ts`).

## `apps/web` app shell (M0 frontend, Group 4)

The application frame every M1–M6 screen lives inside — built in `apps/web` from `@erp/ui`
primitives (there is no shell/nav component in `@erp/ui`). Consumes the design system once via
`@erp/ui/styles.css` + `@erp/ui/fonts`; `src/styles.css` re-imports that and adds `@source "./"`
so Tailwind v4 generates apps/web utilities. `@tailwindcss/vite` is in the Vite config; ESLint adds
`styleTokenBoundaries` (semantic tokens only — primitives/raw-hex banned in style strings).

- **Attributes live on `<html>`**: `ThemeProvider` (`src/theme/`) writes `data-theme`, `DensityProvider`
  (`src/density/`) writes `data-density`, `LocaleProvider` (`src/i18n/`) writes `lang`. On the document
  root (not a shell wrapper) so Radix-portaled overlays (Dialog/Drawer/Toast, cmdk) inherit them.
  There is **no** `prefers-color-scheme` rule in `tokens.css` — `ThemeProvider` reads `matchMedia` in
  JS. Pure resolvers (`resolve-theme.ts`, `resolve-density.ts`) hold the precedence logic and are unit-tested.
- **Ink chrome via nested `data-theme="dark"`**: the sidebar/drawer are ink-900 in *both* app themes.
  Wrapping them in `data-theme="dark"` re-resolves their semantic colors to light-on-dark — zero theme
  logic, semantic tokens only (do **not** reach for `--color-text-inverse` on the chrome; it flips to ink in dark).
- **One nav registry is the source of truth**: `src/nav/registry.ts` (a typed `ModuleDescriptor[]`) drives the
  route tree (`src/router/route-tree.tsx`), sidebar, mobile tab bar, drawer, and command palette. `filterNav`
  (`src/nav/filter.ts`, pure) gates by any-of module permissions (from `@erp/contracts`) with super-admin bypass;
  unpermitted modules are **absent** from the DOM, `superAdminOnly` (Admin & Access) is bottom-anchored.
- **Routing** is code-based TanStack Router (no codegen). Per-route metadata (`title`/`kiosk`/`permissions`/`navKey`)
  is typed via `StaticDataRouteOption` augmentation (`src/router/static-data.d.ts`) and read generically through
  `useMatches` (breadcrumb, kiosk density). `beforeLoad` guards redirect (`src/router/guards.ts`); the live
  session is injected into router `context` by `InnerRouter` in `main.tsx` so guards read it synchronously.
- **Session** (`src/session/`) is an in-memory stub (`AuthUser` = identity + `isSuperAdmin` + `Permission[]`);
  real login lands with M1 (`api/client.ts` `baseHeaders` is the token seam). `VITE_DEV_PERMISSIONS` shapes the
  dev user (`*`/unset = super admin, `none` = nothing, CSV = exactly those) to demo role-filtering.
- **Command palette** (`src/command-palette/`) is cmdk; entries come from `filterNav`. One `window` keydown
  (`useCommandKeymap`) toggles on ⌘/Ctrl-K and opens on `/` (the search lives in the palette); **Esc is left to
  cmdk's Radix dialog**. cmdk positioning/z-layer are styled in `src/styles.css` via `[cmdk-*]` (token vars).
- **Responsive** is pure CSS `md:` (the token `--bp-md`): `Sidebar` is `hidden md:flex`, `MobileTabBar`
  `md:hidden`, `NavDrawer` (@erp/ui `Drawer`) is the mobile overflow. `Shell` (root-route component) never
  remounts on navigation; only the `<Outlet/>` does. i18n is minimal i18next (`th` default + `en`, one `shell`
  namespace) — Group 7 extends it (module namespaces, typed keys, CI completeness). Tests: Vitest + RTL
  (`src/test/render.tsx` wraps a memory router + providers; `await` it — the router loads before render).

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
