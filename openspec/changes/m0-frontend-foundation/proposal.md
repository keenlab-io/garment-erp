# M0 — Frontend Shared Foundation

## Why

The backend M0 foundation is built: auth, permissions, uniform errors, pagination, and the typed contract layer all exist and every module plan (M1–M6) assumes them. The frontend has no counterpart. `apps/web` is a one-page Ant Design skeleton with no design tokens, no app shell, no routing, no permission-aware rendering, no i18n, and no density mechanism — yet every M1–M6 screen spec (UX/UI Spec Part B) is written against a shared foundation: the locked "Ink & Substrate" token system, the Ink-Chip status language, a role-filtered shell, the Data Table workhorse, field-level permission masking, and Thai-first bilingual layout. Without building that foundation once, six modules would each improvise their own — the exact inconsistency the backend M0 was built to prevent.

Now is the moment: the design direction and tokens are **locked** (`docs/PartA_Direction_Tokens_LOCKED.md`), the permission catalog and status enums the UI must render already exist in `@erp/contracts`, and no module UI has shipped yet — so replacing the stack costs one demo page, not six modules.

## What Changes

- **BREAKING: Ant Design is removed from `apps/web`.** The foundation is rebuilt on React + TypeScript + **Radix UI** headless primitives + **Tailwind** mapped to the locked tokens + an **owned shadcn-style component layer** + **TanStack Table**, per UX Spec Part C and the locked token doc. The existing antd demo page is rewritten on the new stack.
- **New package `@erp/design-tokens`**: the locked Ink & Substrate token system (light + dark semantic layers, Ink-Chip status set, typography, radius/elevation, three density sets, motion) as Style Dictionary source, built into CSS custom properties and a Tailwind preset. Framework-agnostic — also consumable by the API's Puppeteer PDF templates so the M5 document preview and the exported PDF share one visual truth.
- **New package `@erp/ui`**: the owned component layer — primitives (Button, Input, Form field, Select, Ink-Chip, Money/Qty cell, Confirm dialog, Drawer, Toast, Skeleton, …), the Data Table organism, and the permission-aware rendering helpers (hooks, `HasPermission`, masked fields, guarded-action dialogs) that consume `Permission` strings from `@erp/contracts`.
- **App shell in `apps/web`**: sidebar + top bar with role-filtered navigation (unpermitted modules absent, not greyed), command palette, theme (light/dark) and density (Comfortable/Compact/Touch) switching via `data-theme`/`data-density` attributes, responsive collapse to bottom-tab + drawer on mobile, toast region, and type-safe routing.
- **Thai-first bilingual i18n**: default-Thai UI with a persisted TH/EN toggle, layout tolerant of ~30% text expansion, Thai typesetting rules (≥1.6 line-height, no justify, no letter-spacing) baked into the token/type layer, locale-aware date/number formatting with money staying string-based via `@erp/utils`.
- **Accessibility baseline**: WCAG 2.1 AA — contrast, visible focus rings, ARIA on icon-only buttons, status never color-alone (enforced by the Ink-Chip component), density-token tap targets (≥44px office, ≥56px touch).
- **Build wiring**: Tailwind + Style Dictionary in the Turbo graph (`design-tokens → ui → web`), self-hosted fonts (Bai Jamjuree, IBM Plex Sans Thai, IBM Plex Mono), Storybook workbench for `@erp/ui`, ESLint boundaries extended (antd banned; `@erp/ui`/`@erp/design-tokens` stay app-agnostic).

No `@erp/contracts` changes: the permission catalog, status enums, and money/qty schemas are consumed exactly as they exist.

## Capabilities

### New Capabilities

- `design-tokens`: the locked Ink & Substrate token system as a built pipeline — Style Dictionary source → CSS custom properties (light/dark themes, three density sets) + Tailwind preset; semantic-only consumption; Ink-Chip status token group; typography/radius/elevation/motion per the locked doc.
- `app-shell`: the application frame — sidebar/topbar with role-filtered navigation, command palette, theme and density switching (Touch auto-applied on coarse-pointer/kiosk contexts), responsive mobile collapse, toast region, routing.
- `ui-primitives`: the owned Radix-based component layer — form and feedback primitives, the Ink-Chip status component, Money/Qty cells, confirm dialogs with reason/re-auth capture, and the WCAG 2.1 AA baseline they enforce.
- `data-table`: the workhorse organism on TanStack Table — sticky header, sorting, row/bulk actions, cursor pagination matching the contract shape, density-aware rows, saved column presets, skeleton loading.
- `permission-aware-ui`: rendering gated by the `@erp/contracts` permission catalog — nav filtering, disabled-with-tooltip actions, field-level masking (`••••` + lock), and guarded-action confirmation flows.
- `i18n-localization`: Thai-first bilingual UI — TH/EN toggle, expansion-tolerant layout, Thai typesetting rules, locale-aware formatting with string-safe money.

### Modified Capabilities

None — `openspec/specs/` is currently empty; this change introduces the first frontend specs. (The backend M0 change's capabilities are untouched.)

## Impact

- **Packages**
  - `@erp/design-tokens` — **new** workspace package (Style Dictionary source + build emitting CSS vars and a Tailwind preset). No framework dependencies.
  - `@erp/ui` — **new** workspace package (React + Radix + Tailwind components, TanStack Table, permission helpers). Depends on `@erp/design-tokens`, `@erp/contracts`, `@erp/utils`; React as a peer dependency. Never imports `apps/*` or data-fetching libraries.
  - `apps/web` — **antd removed (BREAKING)**; gains `@erp/ui`, `@erp/design-tokens`, Tailwind, TanStack Router, i18next; existing demo page rewritten on the new shell + Data Table.
  - `apps/api` — optional, later (M5): PDF HTML templates import the built token CSS from `@erp/design-tokens`. No change in this M0.
  - `packages/config` — ESLint preset extended: ban `antd` imports; boundary rules for the two new packages.
- **New dependencies**: `@radix-ui/react-*`, `tailwindcss`, `class-variance-authority`/`clsx`, `@tanstack/react-table`, `@tanstack/react-router`, `cmdk`, `lucide-react`, `i18next` + `react-i18next`, `@fontsource/*` (self-hosted Bai Jamjuree, IBM Plex Sans Thai, IBM Plex Mono), `style-dictionary` (dev), `storybook` (dev). Removed: `antd`.
- **Build**: two new nodes in the Turbo graph (`design-tokens` builds before `ui` before `web`); token build output is generated, git-ignored, and cacheable; Storybook and component tests wired into `pnpm test`/`lint`.
- **Downstream**: every M1–M6 frontend plan builds screens from these capabilities; the first consumer slice (per UX Spec Part C) is the Data Table in the app shell, then M3 Item Detail / Stock Card.
