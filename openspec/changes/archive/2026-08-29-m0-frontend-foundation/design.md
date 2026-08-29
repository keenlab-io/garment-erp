# M0 — Frontend Shared Foundation: Design

## Context

The backend M0 change stands up the cross-cutting server foundation; this change is its frontend sibling. `apps/web` today is a single antd page proving the typed contract loop (health + demo invoices via `@ts-rest/react-query`). Meanwhile the UX contract is fully specified: `docs/UX_UI_SPEC_M1-M6.md` Part A defines the IA, component inventory, interaction/state patterns, and accessibility baseline, and `docs/PartA_Direction_Tokens_LOCKED.md` **supersedes** the spec's proposed A4/A5 with the locked system — the "Ink & Substrate" palette (warm carbon ink chrome, warm paper surfaces, press-cyan accent, magenta spot), Bai Jamjuree display face, 6px/3px radii, ink-tinted shadows, a full dark semantic mapping, and the **Ink-Chip status language** as the visual signature with the **three-density system** as the interaction signature.

Constraints that drive the design:

- **Contracts are the source of truth** — permission strings (`Permission`, `PERMISSIONS`, `isPermission`), status enums (`RoutingStatus`, `UserStatus`, …), and money/qty string schemas come from `@erp/contracts` and are never duplicated.
- **`apps/web` and `apps/api` never import each other** (ESLint-enforced); any shared frontend code must live in `@erp/*` packages that preserve that boundary.
- **Full ESM / NodeNext** repo: node-executed packages use explicit `.js` relative specifiers; bundler-resolved app code (Vite) keeps its `moduleResolution: Bundler` config. New packages follow `@erp/*`, `private: true`, `workspace:*` conventions.
- **Money/qty are strings on the wire**; all display formatting must go through `@erp/utils` decimal helpers, never floats.
- The M5 document editor is **WYSIWYG against a Puppeteer-rendered PDF** — the preview and the PDF must share the same visual tokens, which constrains where tokens live.

## Goals / Non-Goals

**Goals:**

- One token pipeline emitting the locked system (light + dark + three densities) that components consume only through semantic names.
- One owned component layer (`@erp/ui`) implementing the A6 inventory's foundation subset, the Ink-Chip signature, and the WCAG 2.1 AA baseline.
- The app shell (role-filtered nav, palette, theme/density switching, responsive collapse) and the Data Table organism — the two things UX Spec Part C says to build first.
- Permission-aware rendering and Thai-first i18n as shared layers every module inherits identically.
- A component workbench (Storybook) so density × theme × locale states are verifiable without booting the full app.

**Non-Goals:**

- No module screens (M1–M6 own those); the only app screen work is rewriting the existing demo page on the new stack as the first consumer.
- No real login/IAM UI — the shell consumes a session context; the login screen against the real auth contract lands with M1 IAM UI (M0 ships the context seam plus a minimal placeholder login route).
- No chart components — the chart library decision is recorded here (D8) but chart panels land with M6.
- No offline/PWA scan queueing (UX spec Q6) — kiosk-density groundwork only.
- No server-side saved views/preferences — M0 persists preferences client-side; server persistence is a later module concern.
- No Figma/token-designer round-trip tooling.

## Decisions

### D1. Replace Ant Design with Radix + Tailwind + an owned component layer + TanStack Table

The skeleton's antd is replaced wholesale. Rationale:

- **The locked system is unreachable through antd.** Ink & Substrate chrome, 6px/3px radii, ink-tinted shadows, the Ink-Chip rendering, and — decisively — the **three-density token mechanism** (one component set reflowing 40/32/64px via `data-density`) don't map onto antd's ConfigProvider theming, which assumes its own component anatomy, sizing model, and CSS-in-JS pipeline. We would fight the kit on every signature element.
- **Both governing documents mandate the target stack.** UX Spec Part C and the locked doc are written for React + Radix headless primitives + Tailwind mapped to the tokens + a shadcn-style owned layer + TanStack Table. Diverging from the UX contract on day one would make every Part B screen spec a translation exercise.
- **Owned components are the point of a design system.** The A6 inventory (Ink-Chip, Money cell, scan field, confirm-with-re-auth, kiosk buttons) is mostly *not* off-the-shelf anyway; Radix supplies the hard accessibility behaviors (focus, ARIA, dismissal, typeahead) while the visual layer stays ours.
- **The cost is one demo page.** No module UI exists yet; this is the cheapest the migration will ever be.

*Alternatives considered:* **Keep antd** — fastest short-term, but permanently fights the locked tokens, density, and bundle size; rejected. **MUI / Mantine / Chakra** — same shaped problem: styled kits with their own theming engines, not headless; rejected. **Headless UI (Tailwind Labs)** — smaller primitive coverage than Radix (no full menu/combobox/toast parity at our needs); rejected. **Full shadcn/ui copy-in** — used as the *pattern* (owned code, CVA variants) but components are written against our tokens and density system rather than copied then rethemed twice.

### D2. Package layout: new `packages/design-tokens` + `packages/ui`, not `apps/web/src/ui`

- **`@erp/design-tokens`** — framework-agnostic token source + build. It must be a package (not app-local CSS) because the API's PDF templates (M5) must consume the same CSS variables to keep the document preview WYSIWYG with the Puppeteer output. `apps/api` importing token CSS from a shared `@erp/*` package preserves the "apps never import each other" rule the same way `@erp/utils` does. No React, no Tailwind dependency at runtime — it *emits* a Tailwind preset but does not depend on consumers using it.
- **`@erp/ui`** — the owned React component layer + gating hooks. A package (not `apps/web/src/ui`) because: (a) ESLint boundaries can enforce that it never imports app code, routers' route tables, or data-fetching clients — keeping components presentational and reusable; (b) Storybook and component tests run against it in isolation and cache in Turbo; (c) a future second surface (dedicated kiosk build, mobile wrapper) consumes it without extraction surgery. Dependencies: `@erp/design-tokens`, `@erp/contracts` (Permission/enum types), `@erp/utils` (money/qty formatting), Radix, CVA/clsx; `react`/`react-dom` as **peer** dependencies.
- Both are `private: true`, scoped `@erp/*`, linked `workspace:*`. Since both are bundler-consumed (Vite), they ship TypeScript-built ESM like `@erp/contracts` does, following the same tsconfig base.

*Alternative considered:* shadcn's own doctrine of app-local components (`apps/web/src/ui`) — simplest, but breaks the PDF-token sharing requirement, prevents lint-enforced purity, and makes the design system a directory convention instead of a dependency-graph fact. Rejected. *Also considered:* one combined `@erp/ui` containing tokens — rejected because the API must be able to take the token CSS **without** pulling React peer deps into its graph.

### D3. Token pipeline: Style Dictionary → CSS custom properties + Tailwind preset

Token source is Style Dictionary JSON in `@erp/design-tokens/src/tokens/`, transcribed from the locked doc §5–§6 (primitives, light semantic layer, dark semantic layer, chip group, type, radius, elevation, density triplets, motion, z-index, breakpoints). The build emits:

1. `dist/css/tokens.css` — primitives + light semantics on `:root`, dark overrides under `[data-theme="dark"]`, density sets under `[data-density="…"]`, and the `prefers-reduced-motion` collapse.
2. `dist/tailwind/preset` — a Tailwind preset whose theme values are `var(--…)` references to **semantic names only** (primitives are not exposed as utilities — this is the enforcement mechanism for "semantic-only consumption", backed by a lint rule banning `--ink-`/`--cyan-`/`--substrate-`/raw-hex references in `@erp/ui` and `apps/web` source).

Theme and density switching are therefore pure attribute flips; components carry zero theme logic (mirroring the locked doc's "dark is a token swap only" rule, including the `--color-bg-paper` stays-white exception).

*Alternatives considered:* hand-written CSS vars + hand-written Tailwind theme — two sources that drift; rejected. Tailwind-config-as-source with CSS vars generated from it — inverts ownership and can't serve the framework-agnostic PDF consumer cleanly; rejected. vanilla-extract/CSS-in-TS — powerful but adds a compiler where CSS vars already model runtime theming natively; rejected.

### D4. Density: `data-density` attribute + token re-resolution, Touch auto-detection in the shell

The shell root carries `data-density` (`comfortable` default, `compact` persisted user toggle, `touch`). The token CSS scopes the three density value sets to the attribute, so **components read `--density-*` names and never know which mode is active**. The shell computes Touch as: route flagged kiosk (route metadata in the route tree) **or** `matchMedia("(pointer: coarse)")` — kiosk routes cannot be overridden manually. Touch additionally sets a context flag components use for behavioral (not visual) changes: suppress hover-only affordances, hide `secondary` table columns, oversized chips.

*Alternative considered:* density as React context driving component props/variants — puts density branches in every component and breaks the "one system, token-driven" locked principle; rejected. CSS `:has()`/container queries per region — density is a whole-surface mode, not a local one; the single attribute keeps it auditable.

### D5. Permission-aware rendering: session context + hooks over `@erp/contracts`

`@erp/ui` exposes `PermissionsProvider` (fed by `apps/web`'s session/auth state), `usePermissions()` returning `has(p: Permission)` with super-admin bypass (mirroring `assertPermissions` semantics server-side), `<HasPermission>`, `<MaskedValue>` (the `••••` + lock field gate), and the guarded-action confirm flow (reason/re-auth). All gates are typed against `Permission` — a typo is a compile error, and a catalog rename breaks web and api in the same change, which is exactly the monorepo's point. The UI layer treats permissions as **UX, not security**: the API guards remain the enforcement; masking additionally requires that gated values simply not be present in responses for unauthorized users (backend responsibility), with `MaskedValue` as the presentation contract.

*Alternative considered:* HOC-only API (`withPermission(Component)`) — kept as a thin convenience but hooks + components are primary; HOCs alone compose poorly with hooks-era code.

### D6. i18n: i18next + react-i18next, typed keys, Thai default

i18next with `react-i18next`, resources bundled per namespace (`common`, `shell`, `table`, …; module namespaces added by M1–M6), `th` as `fallbackLng`-and-default, `en` complete. Type safety via i18next's TypeScript resource augmentation so unknown keys fail typecheck; a CI completeness check diff's `th`/`en` key sets. Formatting: dates/plain numbers via `Intl` bound to the active locale; money/qty exclusively via `@erp/utils` (string/decimal in, formatted string out) with locale controlling only presentation. Arabic digits in both locales. `<html lang>` tracks the locale; fonts (Plex Sans Thai, Bai Jamjuree, Plex Mono) are self-hosted via `@fontsource` so both scripts render identically offline/on-floor.

*Alternatives considered:* react-intl/FormatJS — message-ID extraction pipeline is heavier than needed for a two-locale in-house app; Lingui — good macros but a smaller ecosystem; both workable, i18next chosen as the boring, well-trodden default with first-class namespace lazy-loading for later module bundles.

### D7. Routing: TanStack Router

Type-safe route tree with per-route metadata (kiosk/density flags, required permissions for module entry, breadcrumb titles) that the shell, nav, and palette all read from one place. Fits the existing TanStack Query investment; file-based route generation keeps module teams' route additions declarative.

*Alternative considered:* React Router v7 — fine and more common, but route-level type safety and typed search params are load-bearing here (M6 shareable filter state via URL is already specced); TanStack Router gives both without codegen bolt-ons.

### D8. Charts: Recharts themed from tokens, deferred to M6

Decision recorded now so M6 doesn't fork the system: Recharts (composable, React-native idioms) themed exclusively from semantic/chart tokens; the token package reserves a categorical chart palette derived from the status inks + cyan/violet range. No chart components ship in M0.

*Alternative considered:* visx — more control, more assembly cost; ECharts — powerful but its own theming/canvas world apart from the token system. Recharts is sufficient for KPI/trend/bar/funnel panels in M6.

### D9. Preserving apps/web ↔ apps/api isolation

The dependency rules extend, not bend:

- `apps/web` → `@erp/ui`, `@erp/design-tokens`, `@erp/contracts`, `@erp/utils`. Never `apps/api`.
- `apps/api` → (later, M5) `@erp/design-tokens` **CSS only** for PDF templates. Never `@erp/ui` (React) and never `apps/web`.
- `@erp/ui` → `@erp/design-tokens`, `@erp/contracts`, `@erp/utils`, Radix. Never `apps/*`, never `@ts-rest/*` clients, never i18next instance ownership (it consumes the app-provided instance via context) — keeping it presentational.
- `@erp/design-tokens` → nothing at runtime.
- ESLint preset in `packages/config` gains: `antd` banned workspace-wide; `@erp/ui` boundary (no apps, no data layer); `@erp/design-tokens` boundary (no framework imports); the existing app-isolation rules unchanged.

### D10. Component workbench: Storybook

Storybook (Vite builder) inside `@erp/ui` with toolbar switches for theme × density × locale, plus `@storybook/addon-a11y` for the AA baseline. This is where the density/theme matrix and Ink-Chip states are verified without booting the app; stories double as the visual reference for module teams building from Part B.

*Alternative considered:* Ladle — lighter and Vite-native, but no a11y addon parity or interaction tests; Storybook's weight is acceptable for the system's reference role.

## Risks / Trade-offs

- **[Rebuilding a component layer costs more than adopting a kit]** — owned Button/Select/Table is slower to first screen than antd. → Mitigation: Radix supplies the hard behaviors; M0 scopes to the foundation subset of A6 (what the shell + Data Table + first M3/M1 screens need), not the whole inventory; shadcn-style patterns (CVA variants) keep authoring mechanical.
- **[Token transcription drift from the locked doc]** — hand-transcribing §5/§6 hexes into Style Dictionary invites typos. → Mitigation: a unit test asserts key locked values (canvas, accent, danger, chip set, radii, density triplets) against the built CSS output; the locked doc is referenced as the review checklist.
- **[Semantic-only rule is socially enforced unless linted]** — Tailwind arbitrary values (`bg-[#0A6E83]`) bypass the preset. → Mitigation: lint bans raw hex and primitive var names in `@erp/ui`/`apps/web` styles; code review checklist; the preset exposes no primitive utilities.
- **[Touch auto-detection misfires]** — `(pointer: coarse)` matches touch laptops; a manager's laptop shouldn't render kiosk-sized rows. → Mitigation: coarse-pointer sets Touch as a *default* the user can override; kiosk **routes** force Touch unconditionally; treat detection as heuristic, route flags as truth.
- **[Thai rendering regressions are easy to miss]** — clipped tone marks and expansion overflow don't show up in English-only review. → Mitigation: Storybook locale toolbar defaults stories to `th`; the i18n spec's clipping/expansion scenarios become checklist items; dense-row Thai fixtures in table stories.
- **[Masking gives false security confidence]** — `MaskedValue` hides pixels, not data. → Mitigation: documented explicitly (D5): unauthorized responses must omit gated values server-side; the component contract assumes the value may be absent.
- **[i18n key debt]** — foundation strings translated late become a pile. → Mitigation: no-hardcoded-strings rule from the first component; CI completeness check lands with the i18n setup, not after.
- **[Two new packages add build-graph surface]** — more `tsc` nodes, more stale-artifact risk (a known repo gotcha). → Mitigation: both packages follow the existing contracts/utils build pattern; token build is deterministic and Turbo-cacheable; no `composite`/`incremental` experiments.
- **[TanStack Router is younger than React Router]** — smaller community, faster-moving API. → Mitigation: usage confined to route-tree + shell integration; route metadata is our own abstraction so a router swap stays localized.

## Migration Plan

1. **Land the new stack beside antd** — `@erp/design-tokens` and `@erp/ui` build green with Storybook before `apps/web` changes.
2. **Rewire `apps/web`** — add Tailwind + token CSS + fonts, mount the router and shell, port the demo page: health card → shell status surface, invoice antd `Table` → `@erp/ui` Data Table fed by the same `@ts-rest/react-query` client (contract untouched).
3. **Remove antd** — drop the dependency and the `antd/dist/reset.css` import; add the lint ban so it cannot return.
4. **Verify** — `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, plus the proxy'd dev loop (`pnpm dev`) showing the demo flows on the new shell in both themes, three densities, both locales.

Rollback: the change is additive until step 3; reverting the branch restores the antd skeleton. No data or contract migration is involved.

## Open Questions

1. **Buddhist-era dates** — Thai tax documents customarily show BE years. Does the M5 document layer render BE while the app UI stays CE (recommended), or is BE display global? Owner: M5 planning; the i18n formatter API should accept a calendar option either way.
2. **Login contract timing** — M0 frontend ships the session-context seam with a placeholder login route; confirm the auth endpoints' contract shape lands early in M1 so the seam is bound before the first gated module screen ships.
3. **Server-side user preferences** — theme/density/locale/table presets persist client-side in M0. Decide (likely M1/M6) when these move to per-user server storage so preferences follow users across stations — relevant for shared floor tablets.
4. **Navy veto** — the locked doc flags one reversible call: retiring the navy brand for Ink & Substrate. This design assumes the lock stands; if the owner vetoes, only `@erp/design-tokens` source changes (that's the pipeline working as intended), but say so before M0 implementation starts.
