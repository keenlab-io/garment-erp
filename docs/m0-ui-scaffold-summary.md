# M0 Frontend Foundation — `@erp/ui` package scaffold + workbench

**Date**: 2026-07-10
**Branch**: `feature/m0-ui-scaffold`
**Change**: `openspec/changes/m0-frontend-foundation` (Group 2, tasks 2.1–2.6)
**Issue**: keenlab-io/garment-erp#35
**Author**: Claude

## Overview

Scaffolds `@erp/ui` — the owned Radix + Tailwind component layer — and its verification
workbench, without building any primitives yet (those land in Groups 3+). The package is styled
exclusively through the already-shipped `@erp/design-tokens` semantic Tailwind preset, self-hosts
its fonts, and ships a Storybook workbench whose theme × density × locale toolbar proves the
locked "Ink & Substrate" system re-resolves purely via `data-theme` / `data-density` attribute
flips. Lint boundaries that keep the layer presentational and semantic-only are added to the
shared config. This unblocks every Group 3+ primitive.

## Changes

### New files — `packages/ui/`
- `package.json` — `@erp/ui`, deps (`@erp/design-tokens`/`@erp/contracts`/`@erp/utils`,
  `@radix-ui/react-slot`, `@tanstack/react-table`, CVA/clsx/tailwind-merge, `@fontsource/*`),
  React 18 **peers**, dev toolchain (Tailwind v4, Storybook 10, Vitest + Testing Library).
- `tsconfig.json` — composite build config (NodeNext, jsx) → `dist/`; excludes stories/tests/showcase.
- `tsconfig.storybook.json` — Bundler-resolution typecheck for `.storybook`/stories/showcase (noEmit).
- `eslint.config.js` — `[base, uiBoundaries, styleTokenBoundaries]`.
- `src/index.ts` — barrel (`cn`, `cva`, `VariantProps`).
- `src/lib/cn.ts` — `cn()` = `twMerge(clsx(...))` + re-exported CVA helper.
- `src/styles.css` — the single Tailwind entry (`@erp/ui/styles.css`) importing tailwind + token CSS + preset.
- `src/fonts.ts` — the single font entrypoint (`@erp/ui/fonts`) with `@fontsource` faces/weights.
- `src/css.d.ts` — ambient `*.css` module shim.
- `.storybook/main.ts` + `.storybook/preview.tsx` — react-vite + `@tailwindcss/vite`; theme/density/locale toolbar + a11y.
- `src/showcase/TokenMatrix.tsx` + `.stories.tsx` + `.test.tsx` — the matrix showcase, its story, and a smoke test.

### Modified files
- `packages/config/eslint-preset.js` — antd banned workspace-wide (folded into `base` + `banImports`);
  new `uiBoundaries` and `styleTokenBoundaries` (raw-hex + primitive-var ban via `no-restricted-syntax`).
- `apps/web/src/App.tsx`, `apps/web/src/main.tsx` — `eslint-disable` on the two legacy antd imports
  (removed wholesale in task 8.2) so root lint stays green under the new workspace-wide ban.
- `openspec/changes/m0-frontend-foundation/tasks.md` — 2.1–2.6 checked.
- `CLAUDE.md` — new `@erp/ui` section.
- `.gitignore` — ignore `storybook-static/`.

## Technical details / decisions

- **Two resolution modes in one package.** Shipped source builds under NodeNext (explicit `.js`
  specifiers, emits to `dist/`); Storybook/story/showcase source is Vite-run, typechecked under
  Bundler resolution with extensionless imports, and excluded from `dist`. `pnpm typecheck` runs
  both tsconfigs.
- **Semantic-only enforcement is now linted**, not just conventional: `styleTokenBoundaries` uses
  esquery regex value selectors to reject `#rrggbb` and `--ink-/--cyan-/--substrate-/--magenta-`
  in string/template literals. `--chip-*` and `--density-*` (semantic) remain allowed, which is
  how the showcase consumes chip/density tokens by name.
- **antd workspace-wide ban vs. the still-live demo.** Task 2 lands the ban but the antd demo page
  isn't rebuilt until task 8; its two imports are explicitly grandfathered with a dated comment
  rather than weakening the ban.
- **Storybook 10** (essentials merged into core) with only `addon-a11y` added; Vite 6 to match the
  existing web app.

## Testing / verification

- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — all green from repo root.
- `pnpm --filter @erp/ui test` — Vitest smoke test passes (Ink-Chip labels render).
- Negative lint checks: temporary files importing `antd`, using `bg-[#0A6E83]`, and `var(--ink-900)`
  each fail lint with the expected rule/message; reverted.
- `pnpm --filter @erp/ui build-storybook` — workbench compiles; built CSS contains the resolved
  token utilities (`var(--color-bg-app)`, `var(--color-accent)`, `var(--font-display)`, `--density-row-h`).
- Turbo graph builds `utils/contracts → design-tokens → ui` in order.

## Usage

```ts
// apps/web (Group 4/8) and Storybook consume the layer like:
import "@erp/ui/fonts";
import "@erp/ui/styles.css";
import { cn } from "@erp/ui";
```

## Related
- Issue: keenlab-io/garment-erp#35
- Design: `openspec/changes/m0-frontend-foundation/design.md` (D1, D2, D3, D9, D10)
- Tokens: `packages/design-tokens`, `docs/PartA_Direction_Tokens_LOCKED.md`
