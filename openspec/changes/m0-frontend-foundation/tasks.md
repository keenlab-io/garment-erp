# M0 — Frontend Shared Foundation: Tasks

## 1. `@erp/design-tokens` — token source + pipeline

- [x] 1.1 Scaffold `packages/design-tokens` — `package.json` (`@erp/design-tokens`, `private: true`, `type: module`, dev deps `style-dictionary`, `@erp/config`, `typescript`), tsconfig extending the shared base, eslint config banning framework imports
- [x] 1.2 Transcribe the locked primitives (PartA_Direction_Tokens_LOCKED §5.1) into Style Dictionary source — substrate, ink, press-cyan, magenta, status inks (green/amber/rubine/violet)
- [x] 1.3 Add the light semantic layer (§5.2) and the Ink-Chip token group (§5.3) — brand/accent/spot, surfaces (incl. `--color-bg-paper`), text, borders, semantic status trios, seven chip tokens with glyph/label metadata
- [x] 1.4 Add the dark semantic layer (§6) as a `data-theme="dark"` override set — lifted accents, lightness-based elevation surfaces, desaturated status/chip values, `--color-bg-paper` pinned to `#FFFFFF` in both themes
- [x] 1.5 Add typography (Bai Jamjuree display / Plex Sans Thai / Plex Mono / numeric tabular-nums, A5.4 scale, leading 1.35/1.6/1.75), radius (3/6/10/full), ink-tinted elevation, motion (150/200/300 + reduced-motion collapse), z-index, and breakpoint tokens
- [x] 1.6 Add the three density token sets (Comfortable/Compact/Touch per A5.6) scoped to `data-density` attribute selectors
- [x] 1.7 Implement the Style Dictionary build emitting `dist/css/tokens.css` (`:root` light + `[data-theme="dark"]` + `[data-density="…"]` + reduced-motion block) and `dist/tailwind/` preset exposing **semantic names only** as `var(--…)` references
- [x] 1.8 Add a unit test asserting locked values in the built output (canvas `#FAF8F4`, accent `#0A6E83`, danger `#C23341`, chip set, radius 6/3, density 40/32/64 rows, paper white in dark)
- [x] 1.9 Wire the package into `turbo.json` (`build` with outputs cached; `ui` and `web` depend on it via `^build`) and verify `pnpm build && pnpm typecheck && pnpm lint` green

## 2. `@erp/ui` — package scaffold + workbench

- [x] 2.1 Scaffold `packages/ui` — `package.json` (`@erp/ui`, `private: true`, deps `@erp/design-tokens`, `@erp/contracts`, `@erp/utils`, Radix packages, `class-variance-authority`, `clsx`, `@tanstack/react-table`; peers `react`/`react-dom`), tsconfig (jsx, bundler resolution) extending the shared base
- [x] 2.2 Extend `packages/config` eslint preset — ban `antd` workspace-wide; `@erp/ui` boundary (no `apps/*`, no `@ts-rest/*`, no router imports); ban primitive token names and raw hex colors in `@erp/ui`/`apps/web` styles
- [x] 2.3 Wire Tailwind in `@erp/ui` using the `@erp/design-tokens` preset; add shared `cn()`/variant utilities
- [x] 2.4 Add self-hosted fonts via `@fontsource` (Bai Jamjuree, IBM Plex Sans Thai, IBM Plex Mono) exported as a single font entrypoint
- [x] 2.5 Set up Storybook (Vite builder) with toolbar switches for theme (`data-theme`) × density (`data-density`) × locale, plus `addon-a11y`; add an example story proving the matrix works
- [x] 2.6 Add component test harness (Vitest + Testing Library + jsdom) wired into `pnpm test`; verify workspace build/typecheck/lint green

## 3. Primitives (atoms + molecules)

- [x] 3.1 Button — primary/secondary/ghost/destructive/icon-only variants; default/hover/active/focus/disabled/loading states; density-token sizing; `aria-busy` on loading; icon-only requires `aria-label` at the type level
- [x] 3.2 Input (text, number-tabular, password, search), Checkbox/Radio/Toggle (with indeterminate), Select/Combobox (single/multi/async-search with loading + no-results states) on Radix primitives
- [x] 3.3 FormField — label + control + help + error + required marker with automatic `id`/`aria-describedby`/`aria-invalid` wiring; on-blur error display support
- [x] 3.4 InkChip — chip-token swatch + glyph + label for `RoutingStatus` (from `@erp/contracts`) and the semantic statuses (hold, outsourced, document lifecycle incl. void = muted + strikethrough); oversized Touch variant; `--chip-active-state` magenta selected state; story proving grayscale legibility
- [x] 3.5 MoneyCell / QtyCell — `--font-numeric` tabular, right-aligned, currency/unit adjacent, formatting via `@erp/utils` (string in, no float), negatives in danger + parentheses
- [x] 3.6 Tooltip, Badge, Avatar, Skeleton (line/block/table-row with shimmer)
- [x] 3.7 Toast system — icon + message + action + dismiss, job-toast variant ("Generating…" → completion notification), shell-level region at `--z-toast`
- [x] 3.8 Dialog + ConfirmDialog — consequence text with record id, optional required-reason field (blank blocks submit), optional re-auth password variant, destructive weighting
- [x] 3.9 Drawer — header + scrolling body + sticky footer at `--z-drawer`
- [x] 3.10 Icon set integration (lucide-react at the 24px grid, sized by `--density-icon`)
- [x] 3.11 Stories + unit tests for every primitive across theme × density; a11y addon passes (focus rings, contrast, labels, ≥44/56px targets)

## 4. App shell (`apps/web`)

- [x] 4.1 Add `apps/web` deps (`@erp/ui`, `@erp/design-tokens`, `tailwindcss`, `@tanstack/react-router`, `cmdk`, i18n deps) and wire Tailwind + token CSS + fonts into the Vite build
- [x] 4.2 Mount TanStack Router with a typed route tree supporting per-route metadata (title/breadcrumb, kiosk flag, required `Permission` for module entry)
- [x] 4.3 Session context — `AuthUser` shape (identity, `isSuperAdmin`, `Permission[]`), provider consumed by shell/nav/palette/gating; placeholder login route rendered when no session (real auth wiring lands with M1)
- [x] 4.4 Shell layout — ink-chrome sidebar + top bar (breadcrumb, search entry, notifications, TH/EN toggle, avatar menu) + content outlet + toast region; shell persists across navigation
- [x] 4.5 Role-filtered nav — items declare required permissions; unpermitted items absent from the DOM; Admin & Access bottom-anchored, super-admin only
- [x] 4.6 Theme provider — `data-theme` from `prefers-color-scheme` default, user toggle override, persisted
- [x] 4.7 Density provider — `data-density` with persisted Comfortable/Compact toggle; Touch auto-applied on kiosk-flagged routes and coarse-pointer devices (route flag not overridable); Touch behavior flag (no hover-only affordances) exposed via context
- [x] 4.8 Command palette (cmdk) — Ctrl/Cmd-K, grouped module/action entries built from route metadata, permission-filtered; `/` focuses search, `Esc` closes
- [x] 4.9 Responsive collapse — below `--bp-md`: bottom tab bar + drawer nav, single-column content; tablet collapsible sidebar

## 5. Data Table organism

- [x] 5.1 DataTable on TanStack Table — typed column definitions, sticky header at `--z-sticky`, sortable columns with asc/desc/none cycling
- [x] 5.2 Cursor pagination consuming the contract `{ data, next_cursor }` shape — next-page action while cursor non-null, end-of-list state on null
- [x] 5.3 Density-aware rendering — row height/padding/font from density tokens; `secondary`-flagged columns hidden in Touch
- [x] 5.4 Money/qty column types rendering via MoneyCell/QtyCell
- [x] 5.5 Row actions (tap-accessible in Touch) + multi-select with bulk-action bar (count + actions); keyboard nav (arrows move active row, space selects)
- [x] 5.6 Saved column presets — save/apply/reset visibility+order+sort per table id, persisted client-side per user
- [x] 5.7 Loading skeleton rows, empty-state slot (explanation + CTA), error state with Retry
- [x] 5.8 Stories + tests: sort/select/pagination behavior, density matrix, Thai long-string fixtures, skeleton/empty/error states

## 6. Permission-aware UI layer

- [x] 6.1 `PermissionsProvider` + `usePermissions()` in `@erp/ui` — `has(p: Permission)` typed against the `@erp/contracts` catalog, super-admin bypass mirroring backend semantics
- [x] 6.2 `<HasPermission required fallback>` component (+ thin `withPermission` HOC convenience)
- [x] 6.3 Disabled-with-tooltip pattern for in-context actions — tooltip names the required permission code (e.g. "Requires sales.document.void")
- [x] 6.4 `<MaskedValue>` — `••••` + lock icon, stable layout slot, accessible restricted-access description, renders mask whenever the gate permission is absent (value never placed in the DOM when masked)
- [x] 6.5 Guarded-action flow — ConfirmDialog presets for force-logout / role delete / document void / stock adjustment / payroll approve wiring reason + re-auth requirements
- [x] 6.6 Tests: typo in a permission string fails typecheck (type-level test), gating truth table incl. super-admin, masking DOM assertion, reason/re-auth blocking

## 7. i18n & localization

- [x] 7.1 i18next + react-i18next setup in `apps/web` — `th` default, `en` complete, namespaces (`common`, `shell`, `table`), persisted toggle in the top bar, `<html lang>` synced; `@erp/ui` consumes the app instance via context
- [x] 7.2 Typed message keys via i18next TS resource augmentation — unknown keys fail typecheck
- [x] 7.3 CI completeness check diffing `th`/`en` key sets (fails on missing keys)
- [x] 7.4 Translate all foundation strings (shell, table, dialogs, toasts, empty states) into both locales
- [x] 7.5 Locale-aware formatters — dates/plain numbers via `Intl`; money/qty via `@erp/utils` only (string-safe, Arabic digits both locales); expose as shared hooks
- [x] 7.6 Thai typesetting verification — Storybook Thai fixtures for dense table rows (no clipped tone marks at any density), ≥1.6 body leading, no justify/letter-spacing on Thai; ~30% expansion check on shell/dialog/table surfaces in both locales

## 8. Rewire `apps/web` demo + remove antd

- [ ] 8.1 Rebuild the demo page on the new foundation — health status surface + invoice list on the DataTable, fed by the existing `@ts-rest/react-query` client (contract untouched), inside the shell
- [ ] 8.2 Remove `antd` from `apps/web` dependencies and delete the `antd/dist/reset.css` import; confirm the workspace-wide antd lint ban is active
- [ ] 8.3 Confirm `pnpm dev` end-to-end: API proxy works, demo flows render in both themes, all three densities, both locales

## 9. Verification

- [ ] 9.1 `pnpm build && pnpm typecheck && pnpm lint && pnpm test` all green from the repo root
- [ ] 9.2 Token assertions pass (locked values present in built CSS; no primitive/raw-hex references in `@erp/ui`/`apps/web` per lint)
- [ ] 9.3 Storybook a11y checks pass across the theme × density matrix (focus rings, contrast, labels, tap targets ≥44px office / ≥56px Touch)
- [ ] 9.4 Manual matrix pass: theme toggle (paper-stays-white in dark), density toggle + Touch auto-apply on a kiosk-flagged route and coarse-pointer emulation, TH/EN toggle with no clipped/overlapping text
- [ ] 9.5 Permission walkthrough with a stub session: unpermitted module absent from nav/palette, in-context action disabled with named permission, cost/salary fields masked, guarded action demands reason/re-auth
- [ ] 9.6 Turbo graph check: `design-tokens → ui → web` ordering, token/ui builds cache and invalidate correctly on token edits
