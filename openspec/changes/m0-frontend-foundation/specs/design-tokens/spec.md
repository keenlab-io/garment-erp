# design-tokens

## ADDED Requirements

### Requirement: Single token source of truth with a built pipeline
All design tokens SHALL live as structured source (Style Dictionary format) in the `@erp/design-tokens` package, and a build step SHALL emit (a) CSS custom properties and (b) a Tailwind preset from that single source. No token value may be hand-duplicated in component code, Tailwind config, or app CSS; the emitted artifacts are generated output, not committed source of truth.

#### Scenario: Token change propagates everywhere from one edit
- **WHEN** a semantic token value (e.g. `--color-accent`) is changed in the `@erp/design-tokens` source and the package is rebuilt
- **THEN** the emitted CSS custom property and the corresponding Tailwind utility both reflect the new value with no other file edited

#### Scenario: Token build participates in the Turbo graph
- **WHEN** `pnpm build` runs from the repo root
- **THEN** `@erp/design-tokens` builds before `@erp/ui` and `apps/web`, and its output is cacheable by Turbo

### Requirement: Components consume semantic tokens only, never primitives
Component and app styles MUST reference only semantic token names (e.g. `--color-accent`, `--color-bg-surface`, `--color-danger`) and density/typography/radius tokens. Primitive scale names (e.g. `--cyan-700`, `--ink-900`, `--substrate-50`) SHALL NOT be referenced outside the `@erp/design-tokens` package itself, and the Tailwind preset SHALL expose only semantic names.

#### Scenario: Primitive reference is rejected
- **WHEN** a file in `@erp/ui` or `apps/web` references a primitive token (e.g. `var(--cyan-700)` or a Tailwind class generated from a primitive)
- **THEN** lint fails the build with a violation identifying the primitive reference

#### Scenario: Theming needs no component change
- **WHEN** the dark theme remaps the semantic layer
- **THEN** components render correctly in dark with zero component-level changes, because they only ever referenced semantic names

### Requirement: Locked Ink & Substrate light palette
The light theme SHALL implement the locked palette (PartA_Direction_Tokens_LOCKED §5), not the earlier proposed navy/slate values. In particular: app canvas `#FAF8F4` (substrate-50), surfaces `#FFFFFF` (substrate-0), chrome/brand ink-900 `#14110D`, primary text ink-800, accent press-cyan `#0A6E83` (cyan-700) with `#084F5E` hover, focus ring cyan-500 `#109FBD`, spot magenta `#C61A78` reserved for the brand mark / active chip / at most one hero CTA per screen, borders ink-200/ink-300, and status inks green `#2E7D52` / amber `#B5781B` / rubine `#C23341` / violet `#6B4FB0` each with subtle-bg and text-on-subtle variants.

#### Scenario: Light theme resolves to locked values
- **WHEN** the app renders with the default (light) theme
- **THEN** `--color-bg-app` resolves to `#FAF8F4`, `--color-accent` to `#0A6E83`, `--color-brand` to `#14110D`, and `--color-danger` to `#C23341`

#### Scenario: Spot magenta is scarce
- **WHEN** any foundation screen or component gallery is reviewed
- **THEN** `--color-spot` appears only on the brand mark, the active/selected chip state, or a single hero CTA — never as a general accent, border, or chart color

### Requirement: Dark theme as a semantic-layer remap
A dark theme SHALL be provided by remapping only the semantic layer per the locked doc §6 (canvas ink-900, raised surfaces by lightness not shadow, lifted/desaturated status inks, cyan-500/400 accents), activated by a `data-theme="dark"` attribute on the document root. The document/PDF preview surface token `--color-bg-paper` MUST remain `#FFFFFF` in **both** themes (documents print on white stock; fidelity beats theming), rendered inside a dimmed frame in dark mode.

#### Scenario: Switching theme is a token swap
- **WHEN** `data-theme` flips between `light` and `dark`
- **THEN** all surfaces, text, borders, and status colors re-resolve via the semantic layer without any component re-render logic beyond the attribute change

#### Scenario: Paper stays white in dark mode
- **WHEN** the dark theme is active and a document-preview surface is rendered
- **THEN** the surface background is `#FFFFFF` (via `--color-bg-paper`), not a dark value

### Requirement: Ink-Chip status token group
A shared status token group SHALL define the Ink-Chip signature per the locked doc §5.3/§6: `--chip-pending` (ink-300, glyph ○), `--chip-in-progress` (cyan-600, ◐), `--chip-completed` (green-500, ●✓), `--chip-delayed` (rubine-500, ▲), `--chip-hold` (amber-500, ❙❙), `--chip-outsourced` (violet-500, ↗), and `--chip-active-state` (magenta-500), with the dark-theme lifted values from §6. Document-lifecycle and stock-health statuses SHALL reuse the semantic set (Draft=muted, Issued/Approved=info, Paid/Posted=success, Overdue/Low=danger, Partial/Near-min=warning, Void=muted+strikethrough) rather than introducing new hues.

#### Scenario: Chip tokens exist in both themes
- **WHEN** either theme is active
- **THEN** all seven chip tokens resolve to the locked values for that theme, and the glyph/label associations are available to the Ink-Chip component alongside the color

### Requirement: Locked typography tokens with Thai typesetting rules
Typography tokens SHALL define: `--font-display` "Bai Jamjuree" (fallback IBM Plex Sans Thai) used only for page/section titles, document-type names, dashboard greeting, login, and empty-state headlines — never body, table cells, or form labels; `--font-sans` IBM Plex Sans Thai stack for everything else; `--font-mono` IBM Plex Mono for codes/IDs/ledger; `--font-numeric` = sans + `font-variant-numeric: tabular-nums` for all money/qty. The type scale follows A5.4 (display 28/700 … caption 12/500). Line-height tokens: 1.35 tight (numbers/table cells), **≥1.6** for Thai body, 1.75 relaxed. Fonts are self-hosted (no external font CDN at runtime).

#### Scenario: Display face is restraint-only
- **WHEN** foundation components render text
- **THEN** only heading/empty-state/display slots use `--font-display`; table cells, inputs, and labels use `--font-sans`; KPI and money figures use `--font-numeric`, not the display face

#### Scenario: Thai body leading is protected
- **WHEN** body text renders in Thai
- **THEN** the computed line-height is ≥1.6 and no style applies `text-align: justify` or letter-spacing to Thai text

### Requirement: Locked radius and ink-tinted elevation
Radius tokens SHALL be the tightened locked values: sm 3px (chips), md 6px (controls), lg 10px (cards), full 9999 (pills/badges) — not the earlier 4/8/12 proposal. Elevation tokens SHALL use ink-tinted shadows `rgba(20,17,13,…)` at the locked low-spread values (sm/md/lg), not navy-tinted ones.

#### Scenario: Controls use the engineered radius
- **WHEN** a button or input renders
- **THEN** its corner radius resolves from `--radius-md` = 6px, and a status chip resolves from `--radius-sm` = 3px

#### Scenario: Shadows belong to the ink neutral
- **WHEN** a raised surface or modal renders in light theme
- **THEN** its shadow color derives from `rgba(20,17,13, …)` per the locked elevation tokens

### Requirement: Three density token sets
The package SHALL emit three density token sets — Comfortable, Compact, Touch — selected by a `data-density` attribute, with the locked values: row height 40/32/64px, control height 36/30/56px, base font 14/13/18px, horizontal pad 16/12/20px, minimum tap target 36/32/56px, icon 18/16/28px. Components read only the density token names; switching the attribute re-themes every density-aware component with no component logic.

#### Scenario: Density attribute switches token values
- **WHEN** `data-density` changes from `comfortable` to `touch` on the shell root
- **THEN** `--density-control-h` re-resolves from 36px to 56px and all controls, rows, and tap targets resize accordingly without re-mounting

### Requirement: Motion tokens honor reduced motion
Motion tokens SHALL define fast 150ms / base 200ms / slow 300ms with the standard easing curve, and when `prefers-reduced-motion` is set, durations SHALL collapse to 0 or opacity-only transitions.

#### Scenario: Reduced motion collapses animation
- **WHEN** the OS reports `prefers-reduced-motion: reduce`
- **THEN** token-driven transitions run with zero duration or opacity-only, with no translate/scale movement
