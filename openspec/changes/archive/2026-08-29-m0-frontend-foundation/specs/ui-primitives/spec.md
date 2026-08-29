# ui-primitives

## ADDED Requirements

### Requirement: Owned component layer on headless primitives
`@erp/ui` SHALL provide the shared component layer, built on Radix UI headless primitives and styled exclusively via semantic design tokens (Tailwind preset from `@erp/design-tokens`). Components are owned source in this repo (shadcn-style), not a wrapped third-party kit; `antd` MUST NOT be imported anywhere in the workspace. The package imports only `@erp/design-tokens`, `@erp/contracts`, `@erp/utils`, Radix, and utility libraries — never `apps/*` code or data-fetching clients.

#### Scenario: antd is banned
- **WHEN** any workspace file imports from `antd`
- **THEN** lint fails the build with a restricted-import violation

#### Scenario: Components are theme- and density-invariant
- **WHEN** the theme or density attribute changes
- **THEN** every `@erp/ui` component adapts purely via token re-resolution, with no theme- or density-specific component variants in code

### Requirement: Button primitive
The Button SHALL provide primary, secondary, ghost, destructive, and icon-only variants with default, hover, active, focus, disabled, and **loading** states. Height and horizontal padding derive from density tokens; the primary variant uses `--color-accent`; the destructive variant uses `--color-danger`. A loading button is non-interactive and announces busy state to assistive technology.

#### Scenario: Loading state blocks double-submit
- **WHEN** a button enters its loading state
- **THEN** further clicks are ignored, a spinner replaces or accompanies the label, and `aria-busy` is set

#### Scenario: Icon-only button is labelled
- **WHEN** an icon-only button renders
- **THEN** it has an accessible name (`aria-label`), and omitting it is a type error

### Requirement: Form field composition
A Form field molecule SHALL compose label + control + help text + error message + required marker, wiring `id`/`aria-describedby`/`aria-invalid` automatically. Errors render inline beneath the field; the pattern supports on-blur per-field validation display and an on-submit summary for long forms.

#### Scenario: Error is announced and associated
- **WHEN** a field enters an error state
- **THEN** the error text renders beneath the control in `--color-danger`, the control has `aria-invalid="true"`, and the error element is referenced by the control's `aria-describedby`

### Requirement: Ink-Chip status component
A single `InkChip` component SHALL be the only way statuses render in the product: a solid swatch using the chip token group plus a **glyph and a text label — never color alone**. It maps `RoutingStatus` values from `@erp/contracts` (Pending ○, InProgress ◐, Completed ●✓, Delayed ▲) and the shared semantic statuses (hold ❙❙, outsourced ↗; document lifecycle and stock health via the semantic set, Void rendered muted + strikethrough). It supports an oversized variant for Touch/kiosk contexts and an active/selected state using `--chip-active-state` (the magenta spot).

#### Scenario: Status is legible without color
- **WHEN** an InChip renders any status
- **THEN** the glyph and label are present so the status is identifiable in grayscale

#### Scenario: Contract enum drives the mapping
- **WHEN** a value of type `RoutingStatus` from `@erp/contracts` is passed to InkChip
- **THEN** it renders the locked chip token, glyph, and label for that status, and passing a string outside the enum is a compile error

#### Scenario: Touch variant is glanceable
- **WHEN** Touch density is active
- **THEN** the chip's oversized variant renders with the 28px icon token and enlarged type, readable across a room

### Requirement: Money and Qty cells
Money and quantity display components SHALL render with `--font-numeric` (tabular numerals), right-aligned, with the currency/unit adjacent, sourced from the contract **string** types and formatted via `@erp/utils` (`formatMoney` and the decimal helpers). They MUST NOT parse values through JavaScript floats. Negative money renders in `--color-danger` with parentheses.

#### Scenario: String in, string out
- **WHEN** a Money cell receives the contract value `"53500.00"`
- **THEN** it formats via `@erp/utils` string/decimal helpers and no `parseFloat`/`Number()` conversion of the amount occurs

#### Scenario: Negative money is visually distinct
- **WHEN** a Money cell receives a negative amount
- **THEN** it renders in the danger color wrapped in parentheses, right-aligned in tabular figures

### Requirement: Confirm dialog with consequence, reason, and re-auth
A Confirm dialog SHALL support: a title, explicit consequence text naming the affected record id (e.g. "This voids invoice QV20260042 and posts a reversing stock entry"), an optional **required reason field** (submit blocked while blank), and an optional **re-auth password field** for super-admin-guarded actions. The confirming action is visually weighted to its consequence (destructive style for destructive actions).

#### Scenario: Reason is required when configured
- **WHEN** a confirm dialog configured with a required reason is submitted with a blank reason
- **THEN** submission is blocked and an inline error appears on the reason field

#### Scenario: Re-auth variant collects a password
- **WHEN** a guarded action (e.g. force-logout, role delete) opens its confirm dialog
- **THEN** the dialog shows the consequence text, a password field, and does not enable confirmation until the password is entered

### Requirement: Feedback and container primitives
The layer SHALL include: Toast (icon + message + optional action + dismiss, plus a job-toast variant for async work), Drawer (side panel with header, scrolling body, sticky footer), Skeleton (line, block, and table-row variants — used instead of spinners for content loading), Tooltip, Badge, Avatar, Select/Combobox (single, multi, async-search with loading and no-results states), and Checkbox/Radio/Toggle with indeterminate support.

#### Scenario: Skeletons over spinners
- **WHEN** a list or detail surface is loading its initial content
- **THEN** skeleton primitives render in the content's layout shape rather than a centered spinner

#### Scenario: Async job feedback
- **WHEN** an async job (export/PDF) is started
- **THEN** a job toast appears immediately ("Generating…") and the completion is delivered as a follow-up notification/toast with the result action

### Requirement: WCAG 2.1 AA baseline
All primitives SHALL meet WCAG 2.1 AA: text contrast ≥ 4.5:1 (3:1 for large text and UI components) against their token backgrounds in both themes; a visible focus ring (via `--color-border-focus`) on every focusable element; ARIA roles/labels via the underlying Radix primitives; and minimum interactive target sizes driven by the density tap token (≥44px effective target in office densities, ≥56px in Touch).

#### Scenario: Focus is always visible
- **WHEN** any interactive primitive receives keyboard focus
- **THEN** a visible focus ring using the focus token renders in both light and dark themes

#### Scenario: Touch targets meet the density floor
- **WHEN** Touch density is active
- **THEN** every interactive element's hit area is at least 56px in its smallest dimension; in Comfortable, at least 44px effective target (including padding/hit-slop)
