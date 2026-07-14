# M0 Frontend — App Shell (`apps/web`)

**Date**: 2026-07-13
**Branch**: `feature/m0-app-shell`
**Change**: `openspec/changes/m0-frontend-foundation` · Group 4 (tasks 4.1–4.9) · issue keenlab-io/garment-erp#37
**Author**: Claude

## Overview

Builds the application frame every M1–M6 module will live inside: a persistent ink-chrome shell
(sidebar + top bar + content outlet + toast region), TanStack Router with typed per-route metadata,
an in-memory session context feeding role-filtered navigation and a Cmd/Ctrl-K command palette, and
theme / density / locale providers driven by pure `data-theme` / `data-density` / `<html lang>`
attribute flips. The design is a faithful execution of the locked "Ink & Substrate" system — the
shell is where the three-density interaction signature becomes visible, while chrome stays quiet and
magenta is reserved for the brand mark.

`apps/web` went from an 8-file antd skeleton to a navigable, permission-filtered, bilingual,
theme/density-switchable shell wrapping placeholder module pages, with the existing `/api`-proxied
health check still working.

## Changes

### New files (by area)
- **Wiring**: `src/styles.css` (Tailwind entry re-importing `@erp/ui/styles.css` + `@source`), `vitest.config.ts`, `src/test/setup.ts`, `src/test/render.tsx` (RTL harness).
- **Providers**: `src/theme/{resolve-theme,theme-context}.ts(x)`, `src/density/{resolve-density,density-context}.ts(x)`, `src/i18n/{i18n,locale-context}.ts(x)` + `resources/{en,th}.ts`, `src/session/{dev-user,session-context}.ts(x)`.
- **Nav registry**: `src/nav/{types,registry,filter}.ts` (the single source of truth).
- **Router**: `src/router/{context.ts,static-data.d.ts,root.route,route-tree,router,guards}.ts(x)` + `routes/{dashboard,placeholder,login}.tsx`.
- **Shell chrome**: `src/shell/{Shell,AppChrome,Sidebar,NavItem,TopBar,Breadcrumb,SearchEntry,DensityToggle,LanguageToggle,ThemeToggle,AvatarMenu,MobileTabBar,NavDrawer,BrandMark}.tsx`.
- **Command palette**: `src/command-palette/{command-context,CommandPalette,useCommandKeymap}.ts(x)`.
- **Tests**: `resolve-theme.test.ts`, `resolve-density.test.ts`, `session-context.test.ts`, `nav/filter.test.ts`, `shell/Sidebar.test.tsx`, `command-palette/CommandPalette.test.tsx`.

### Modified files
- `package.json` — added `@erp/ui`, `@erp/design-tokens`, `@tanstack/react-router`, `cmdk`, `i18next`, `react-i18next`, `lucide-react` (pinned `1.24.0` to dedupe with `@erp/ui`), `tailwindcss`/`@tailwindcss/vite`, vitest + RTL; `test` script now `vitest run`. The `antd` line is intentionally retained for Group 8.2 to remove.
- `vite.config.ts` — added the `@tailwindcss/vite` plugin (kept the `/api` proxy).
- `eslint.config.js` — added `styleTokenBoundaries` (semantic-tokens-only, previously not applied to apps/web).
- `main.tsx` — rewritten: `QueryClientProvider → ThemeProvider → LocaleProvider → SessionProvider → InnerRouter`.
- `CLAUDE.md`, `openspec/changes/m0-frontend-foundation/tasks.md` (4.1–4.9 checked).

### Deleted
- `src/App.tsx` — the antd demo, now orphaned (dropped per the "clean placeholder dashboard" decision; the `antd` dep line stays for Group 8.2).

## Key technical decisions

1. **`data-theme` / `data-density` on `<html>`** (not the shell root) so Radix-portaled overlays (Dialog/Drawer/Toast, cmdk) inherit theme + density — they portal to `document.body`, a sibling of the shell.
2. **Ink chrome via a nested permanent `data-theme="dark"` scope** — the sidebar/drawer are ink-900 in both themes; nesting a dark scope re-resolves their semantic colors to light-on-dark with zero theme logic (avoids the `--color-text-inverse`→ink flip in dark mode).
3. **One typed nav registry** drives routes + sidebar + tab bar + drawer + palette; `filterNav` (pure) gates by any-of module permissions with super-admin bypass; unpermitted modules are absent from the DOM.
4. **Typed route metadata** via `StaticDataRouteOption` augmentation, read generically through `useMatches` (breadcrumb, kiosk density). Code-based route tree, no router codegen.
5. **Global search = the palette** — `/` opens it (its input autofocuses), ⌘/Ctrl-K toggles, from a single `window` keydown; Esc is left to cmdk's Radix dialog.
6. **Responsive via pure CSS `md:`** (the `--bp-md` token) — no JS media query for layout.

## Testing

- **Runner**: Vitest + Testing Library + jsdom (mirrors `@erp/ui`); `src/test/setup.ts` polyfills `matchMedia` + `ResizeObserver`.
- **17 tests, all passing.** Unit: theme/density resolvers, `hasPermission` (incl. empty-set super-admin), `filterNav` truth table. Integration (RTL): `Sidebar` renders unpermitted modules absent from the DOM (asserted by link href) / Admin only for super-admin; `CommandPalette` opens on ⌘K and offers only permitted modules.
- **Whole-graph gates green**: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (design-tokens → ui → web).
- **Runtime smoke**: `pnpm --filter @erp/web dev` serves the app; every module + the token/cmdk CSS transform without error (no headless browser available in this environment for a full click-through).

## Scope boundaries (deferred to later groups)

- Full i18n system — typed message keys, th/en CI completeness check, translating every surface, Thai typesetting checks — is **Group 7**; this group ships a minimal i18next (`shell` namespace) that Group 7 extends.
- The DataTable-backed invoice demo and `antd` dependency removal are **Groups 5 & 8**; the Dashboard shows a token-styled health panel and an empty-state placeholder for now.
- The permission-aware UI layer in `@erp/ui` (`PermissionsProvider`, `MaskedValue`, guarded-action presets) is **Group 6**; Group 4's session context is the seam it will consume.
- The top-bar scan affordance is an M4 concern (opens the scan overlay) and is omitted here.

## Usage

```bash
pnpm --filter @erp/web dev     # http://localhost:5173, /api proxied to :3000
# Demo role-filtering with a non-super-admin dev session:
VITE_DEV_PERMISSIONS="sales.invoice.create,inventory.receipt.manage" pnpm --filter @erp/web dev
```
