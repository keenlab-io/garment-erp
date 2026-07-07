# M0 Frontend Foundation — Task 1: `@erp/design-tokens`

**Date**: 2026-07-07
**Branch**: `feature/m0-design-tokens`
**Author**: Claude
**Change**: `openspec/changes/m0-frontend-foundation` (tasks §1)
**Issue**: keenlab-io/garment-erp#34

## Overview

First piece of the M0 frontend foundation: a framework-agnostic token package that is the
single source of truth for the **locked "Ink & Substrate" design system**
(`docs/PartA_Direction_Tokens_LOCKED.md`). A Style Dictionary source is compiled by a custom
build into (a) one `tokens.css` carrying the light theme, a `data-theme="dark"` remap, three
`data-density` sets, and a reduced-motion collapse, and (b) a Tailwind v4 preset that exposes
**semantic token names only**. Downstream packages (`@erp/ui`, `apps/web`, and later the M5
PDF templates in `apps/api`) consume tokens exclusively through these artifacts, so theme and
density switching are pure attribute flips with zero component logic.

The visual direction was already locked, so this task is faithful transcription + pipeline,
not new design. The wireframes (`docs/wireframes/*.html`) were used to cross-check the
transcription — their palette, fonts, and radii match the locked values exactly.

## Changes

### New package: `packages/design-tokens/`
- `package.json` / `tsconfig.json` / `eslint.config.mjs` / `vitest.config.ts` — scaffold
  mirroring `packages/utils`; `build = tsc --build && tsx src/build-tokens.ts`.
- `src/tokens/primitives.ts` — §5.1 substrate / ink / press-cyan / magenta / status inks.
- `src/tokens/semantic.ts` — §5.2 light + §6 dark semantic layers and the §5.3 Ink-Chip
  group; semantics reference primitives so dark is a token swap; `--color-bg-paper` pinned to
  `#FFFFFF` in both themes.
- `src/tokens/scale.ts` — typography (Bai Jamjuree display / Plex Sans Thai / Plex Mono /
  numeric, A5.4 scale, 1.35/1.6/1.75 leading), radius 3/6/10/full, ink-tinted elevation,
  spacing, motion + easing, z-index, breakpoints.
- `src/tokens/density.ts` — Comfortable / Compact / Touch sets (40/32/64 rows, …).
- `src/tokens/index.ts` / `types.ts` — merged source tree + token type.
- `src/build-tokens.ts` — custom Style Dictionary format that emits the single multi-selector
  `tokens.css` plus the Tailwind v4 `@theme inline` preset (`preset.css`) and a JS shim
  (`preset.js` + `preset.d.ts`). Exposes `buildTokens()` (file output) and `renderAll()`
  (in-memory, for tests).
- `src/chips.ts` — Ink-Chip glyph/label metadata (`INK_CHIPS`, `CHIP_ACTIVE_STATE_TOKEN`).
- `src/index.ts` — public TS API: chip metadata + `THEMES` / `DENSITIES` constants.
- `src/build-tokens.spec.ts` — locked-value assertions.

### Modified
- `packages/config/eslint-preset.js` — added `designTokensBoundaries` (bans React / Nest /
  Tailwind / other `@erp/*` imports so the package stays runtime-dependency-free).
- `CLAUDE.md` — layout line + a `@erp/design-tokens` section.
- `openspec/changes/m0-frontend-foundation/tasks.md` — §1 items checked off.

## Technical details

- **One file, many selectors.** Style Dictionary emits one output per file entry, but the
  spec needs a single `tokens.css` with several selector blocks. A custom format groups the
  transformed tokens by a derived "block" (root / dark / density-*) and concatenates
  `:root {…}`, `[data-theme="dark"] {…}`, `[data-density="…"] {…}`, then appends the
  reduced-motion `@media`. Comfortable density also lands on `:root` as the attribute-less
  default.
- **Semantic = `var(--primitive)`.** Rather than rely on Style Dictionary's `outputReferences`
  across filtered token sets, the format resolves each reference via `usesReferences` /
  `getReferences` and emits `var(--<primitive-name>)`. Primitives are defined once on `:root`;
  dark/density blocks re-point or override only the semantic/density names.
- **Naming.** A `name/erp` transform sets each variable name to `path.join('-')` (segments are
  pre-cased, hyphens embedded in multi-word keys) so names match the locked doc exactly; the
  `light`/`dark` prefix is stripped and the `density.<mode>` segment is rescoped at emit time.
- **Semantic-only Tailwind.** The v4 preset uses `@theme inline` referencing the runtime CSS
  vars; no primitive appears (a test asserts this), which is half the "semantic-only
  consumption" enforcement — the lint ban in `@erp/ui`/`apps/web` is the other half (task 2).

## Testing

- Unit tests: `packages/design-tokens/src/build-tokens.spec.ts` — 12 tests, all passing.
  Pin: canvas `#FAF8F4`, accent → `cyan-700` `#0A6E83`, brand `#14110D`, danger `#C23341`,
  radius md 6 / sm 3, density rows 40/32/64, `--color-bg-paper` white in both themes, all
  seven chip tokens present in both themes with glyph/label metadata, reduced-motion collapse,
  and the Tailwind preset exposing semantic names with no primitive leakage.
- Full verification from repo root: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
  all green (6 build / 9 typecheck / 6 lint / 9 test tasks).

## Usage

```ts
// CSS variables (in an app entry):     import "@erp/design-tokens/css";
// Tailwind v4 preset (in app CSS):     @import "@erp/design-tokens/tailwind.css";
import { INK_CHIPS, DENSITIES, THEMES } from "@erp/design-tokens";
```

## Notes / follow-ups

- The package lands standalone; its consumers (`@erp/ui`, `apps/web`) arrive in tasks 2–8, at
  which point Turbo's existing `dependsOn: ["^build"]` orders `design-tokens → ui → web`
  automatically — no `turbo.json` change was needed now.
- Turbo prints a benign `no output files found for @erp/design-tokens#test` warning (shared by
  contracts/db/utils/web); those `test` tasks don't emit coverage. Not an error.
- `--font-numeric` resolves to the sans stack; the `tabular-nums` variant is applied at the
  Money/Qty components (task 3.5).
