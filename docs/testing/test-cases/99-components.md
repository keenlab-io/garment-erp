# @erp/ui component test cases (TC-CMP) — Storybook

Isolated component behaviors exercised in the Storybook workbench
(`pnpm --filter @erp/ui storybook`, http://localhost:6006). Story ids below were derived from the
real `title`/export names in each `packages/ui/src/components/<name>/*.stories.tsx`; open a story
directly at `/?path=/story/<id>` (or `/iframe.html?id=<id>` for chrome-free automation). Expected
behavior cross-checked against each component's `.test.tsx`.

> The workbench toolbar flips theme × density × locale (`data-theme` / `data-density` / `<html lang>`)
> — rerun visual assertions per matrix cell where noted.

## Coverage checklist

- [x] DataTable: sort cycle, cursor pagination, bulk-select bar, column presets persist, keyboard nav, touch hides secondary, empty, error+Retry (TC-CMP-01..08)
- [x] InkChip: mapping + void muted/strikethrough + magenta active (TC-CMP-09, 10)
- [x] ConfirmDialog: required reason; re-auth password (TC-CMP-11, 12)
- [x] GuardedActionDialog presets: void reason, force-logout re-auth, payroll permission-only (TC-CMP-13..15)
- [x] Combobox type-filter + keyboard; Select keyboard (TC-CMP-16, 17)
- [x] Wizard step gating + blocked continue (TC-CMP-18, 19)
- [x] ScanField enter-to-add + undo (dedupe flagged) (TC-CMP-20)
- [x] Toast + job-toast resolve-in-place (TC-CMP-21)
- [x] FormField aria wiring (TC-CMP-22)
- [x] MoneyCell / QtyCell formatting + alignment (TC-CMP-23, 24)
- [x] PermissionButton denied state; MaskedValue redaction (TC-CMP-25, 26)

## DataTable (Organisms/DataTable)

### TC-CMP-01 — Sortable header cycles asc → desc → none
- **Target**: Storybook @ :6006 (`organisms-datatable--default`)
- **Persona**: n/a (workbench)
- **Preconditions**: story loaded; quotation fixture rows QV20260037–42 visible
- **Priority**: smoke
- **Steps**:
  1. Click the "Document" column header once, twice, three times, reading row order each time.
- **Expected**:
  1. Click 1: ascending (QV20260037 first), header `aria-sort="ascending"`.
  2. Click 2: descending (QV20260042 first), `aria-sort="descending"`.
  3. Click 3: sort cleared — original fixture order restored, no `aria-sort`.
- **Automation notes**: `getByRole("columnheader", { name: "Document" })`; assert `aria-sort` and first-row cell text. Header is sticky (`--z-sticky`) — irrelevant to the assertion but scrolling won't detach it.

### TC-CMP-02 — Cursor pagination: Next disables at null cursor, Prev returns
- **Target**: Storybook @ :6006 (`organisms-datatable--pagination`)
- **Persona**: n/a
- **Preconditions**: story loaded; page 1 shows 3 of 6 rows, cursor non-null
- **Priority**: golden-path
- **Steps**:
  1. On page 1, check the Next control state, then click Next.
  2. On page 2 (QV20260039/38/37), check Next again.
  3. Click Prev.
- **Expected**:
  1. Next is enabled while `next_cursor` is non-null; page 2 rows replace page 1.
  2. Next is **disabled** and the end-of-list state shows (cursor is `null`).
  3. Prev returns to page 1's rows.
- **Automation notes**: table is presentational — it only emits `onNextPage`/`onPrevPage` intent; the story's parent owns the pages. Buttons resolve via the `table` i18n namespace — prefer `getByRole("button", { name: /next/i })` with locale pinned to EN.

### TC-CMP-03 — Bulk selection shows the magenta bar with count
- **Target**: Storybook @ :6006 (`organisms-datatable--with-selection`)
- **Persona**: n/a
- **Preconditions**: story loaded; selection checkboxes visible
- **Priority**: golden-path
- **Steps**:
  1. Check the row checkboxes for two rows.
  2. Read the bulk bar; click its clear control.
  3. Check the header (select-all) checkbox.
- **Expected**:
  1. A magenta (`bg-spot`) bulk bar appears with the selected count ("2 selected"-style) and the actions "Print barcodes" / "Export".
  2. Clear deselects all rows and hides the bar.
  3. Header checkbox selects all 6 rows; count updates.
- **Automation notes**: `getByRole("checkbox")` per row; bulk-bar copy comes from the `table` namespace (count-interpolated) — match `/selected/` in EN.

### TC-CMP-04 — Column presets persist across reload for the same table id
- **Target**: Storybook @ :6006 (`organisms-datatable--saved-presets`)
- **Persona**: n/a
- **Preconditions**: story loaded; localStorage clean of prior `quotations-demo` presets
- **Priority**: high-risk
- **Steps**:
  1. Open the columns popover; hide the "Owner" column; save the view.
  2. Reload the browser page (same story).
  3. Reopen the popover and use Reset.
- **Expected**:
  1. "Owner" disappears from the header row.
  2. After reload, "Owner" is **still hidden** — the preset persisted to localStorage keyed by `tableId="quotations-demo"`.
  3. Reset clears the saved preset; "Owner" returns.
- **Automation notes**: popover is Radix `Popover` (no dropdown-menu dep). Clear localStorage in test setup or the story leaks state between runs. Column toggles are checkboxes named by header text.

### TC-CMP-05 — Roving-tabindex keyboard nav: arrows move the active row, Space toggles
- **Target**: Storybook @ :6006 (`organisms-datatable--with-selection`)
- **Persona**: n/a
- **Preconditions**: story loaded
- **Priority**: golden-path
- **Steps**:
  1. Tab focus into the table body; press ArrowDown twice.
  2. Press Space.
  3. Press ArrowUp, then Space again.
- **Expected**:
  1. The active row moves down with each arrow (single tab stop — roving tabindex, `tabindex=0` only on the active row).
  2. Space toggles selection on the active row (bulk bar appears with count 1).
  3. Arrow moves up; Space selects that row too (count 2).
- **Automation notes**: `page.keyboard.press("ArrowDown"/"Space")`; assert `document.activeElement` row and `aria-selected`/checkbox state. Table is `role="grid"`.

### TC-CMP-06 — `density="touch"` hides secondary columns
- **Target**: Storybook @ :6006 (`organisms-datatable--density-matrix`)
- **Persona**: n/a
- **Preconditions**: story loaded (three stacked tables: comfortable / compact / touch)
- **Priority**: golden-path
- **Steps**:
  1. Read the header row of the "comfortable" table.
  2. Read the header row of the "touch" table.
- **Expected**:
  1. Comfortable shows all columns including "Qty" and "Owner" (both `secondary: true`).
  2. Touch omits "Qty" and "Owner" entirely; rows are taller (64px touch row height).
- **Automation notes**: scope each assertion inside the wrapper with the matching `[data-density]`. Also spot-check row heights reflow 40/32/64 across the three blocks (visual/pixel assertion optional).

### TC-CMP-07 — Empty state renders title, description, and CTA
- **Target**: Storybook @ :6006 (`organisms-datatable--empty`)
- **Persona**: n/a
- **Preconditions**: story loaded with zero rows
- **Priority**: smoke
- **Steps**:
  1. Observe the table body.
- **Expected**:
  1. Empty state shows "No quotations yet", "Quotations you create will appear here.", and a "New quotation" button — no skeleton, no header-only void.
- **Automation notes**: `getByText("No quotations yet")`, `getByRole("button", { name: "New quotation" })`.

### TC-CMP-08 — Error state shows the message with a working Retry
- **Target**: Storybook @ :6006 (`organisms-datatable--error-state`)
- **Persona**: n/a
- **Preconditions**: story loaded in error state
- **Priority**: high-risk
- **Steps**:
  1. Read the error surface; click the Retry action.
- **Expected**:
  1. The message "The list service didn't respond. Check your connection and try again." renders with a Retry button; clicking it fires `onRetry` (story handler is a no-op — verify it is clickable and doesn't throw).
- **Automation notes**: Retry label resolves via the `table` namespace — `getByRole("button", { name: /retry/i })` with EN locale. Also see `organisms-datatable--loading` for the skeleton-row state if a loading assertion is wanted.

## InkChip (Primitives/InkChip)

### TC-CMP-09 — Status→chip mapping; void renders muted + strikethrough, no swatch
- **Target**: Storybook @ :6006 (`primitives-inkchip--all-statuses`)
- **Persona**: n/a
- **Preconditions**: story loaded (rows: Routing / Shop floor / Document lifecycle / Stock health / AR aging)
- **Priority**: smoke
- **Steps**:
  1. Verify every status renders a chip with both a glyph and a label (never color alone).
  2. Inspect the "void" chip in the Document lifecycle row.
- **Expected**:
  1. All statuses render: routing (pending/in-progress/completed/delayed), shop (hold/outsourced), document (draft…void), stock (stock-ok/near-min/dead), aging buckets.
  2. **void** is muted with a line-through label and **no color swatch** — visually distinct from every live status.
- **Automation notes**: assert computed `text-decoration: line-through` on the void chip's label and absence of its swatch element. `primitives-inkchip--grayscale-legibility` proves color-independence; `--from-routing-status` covers the `routingStatusToChip` bridge.

### TC-CMP-10 — Active chip carries the magenta active treatment
- **Target**: Storybook @ :6006 (`primitives-inkchip--active-state`)
- **Persona**: n/a
- **Preconditions**: story loaded (plain vs `active` chips side by side)
- **Priority**: golden-path
- **Steps**:
  1. Compare the plain "in-progress" chip to the `active` one (label "In Progress (matched)").
- **Expected**:
  1. Active chips show the magenta `--chip-active-state` treatment; the plain chip does not. Label override renders verbatim.
- **Automation notes**: assert a style/class difference driven by the semantic token (never a raw hex literal — those are lint-banned). Repeat in dark theme via the toolbar: the distinction must survive the token swap.

## ConfirmDialog (Primitives/Dialog)

### TC-CMP-11 — Void-invoice confirm: consequence + required reason gate
- **Target**: Storybook @ :6006 (`primitives-dialog--void-invoice`)
- **Persona**: n/a
- **Preconditions**: story loaded; dialog closed
- **Priority**: high-risk
- **Steps**:
  1. Click "Void invoice" to open the dialog.
  2. Click the confirm button ("Void invoice") with the reason blank.
  3. Type a reason and confirm.
- **Expected**:
  1. Title "Void invoice QV20260042?"; consequence text names the record: "This voids invoice QV20260042 and posts a reversing stock entry. It cannot be undone."
  2. Submit is blocked with an inline error on the blank required reason.
  3. With a reason entered, confirm succeeds and the dialog closes.
- **Automation notes**: `getByRole("dialog")`; confirm via `getByRole("button", { name: "Void invoice" })` **inside** the dialog (the trigger has the same name). Cancel/close labels fall back to the `common` namespace.

### TC-CMP-12 — Re-auth guarded confirm stays disabled until the password is entered
- **Target**: Storybook @ :6006 (`primitives-dialog--reauth-guarded`)
- **Persona**: n/a
- **Preconditions**: story loaded; dialog closed
- **Priority**: high-risk
- **Steps**:
  1. Click "Delete role"; observe the dialog ("Delete the Warehouse role?" + consequence naming 6 affected users).
  2. Fill the reason but leave the password empty; check the confirm button.
  3. Enter a re-auth password; confirm. Also exercise Cancel.
- **Expected**:
  1. Dialog requires **both** a reason and a password (`requireReason` + `requirePassword`).
  2. Confirm ("Delete role") remains **disabled** until the password field has a value — reason alone is not enough.
  3. With both filled, confirm closes the dialog; Cancel closes without confirming at any stage.
- **Automation notes**: password input is `type=password` — use `getByLabel`. Per `confirm-dialog.test.tsx`, `confirmDisabled` also force-disables regardless of inputs (prop-level check, unit-covered).

## GuardedActionDialog (Permission/GuardedActionDialog)

### TC-CMP-13 — `document-void` preset names the subject and requires a reason
- **Target**: Storybook @ :6006 (`permission-guardedactiondialog--document-void`)
- **Persona**: n/a (story renders inside a super-admin `PermissionsProvider`)
- **Preconditions**: story loaded; click "Trigger" to open
- **Priority**: high-risk
- **Steps**:
  1. Open the dialog and read the consequence copy.
  2. Try to confirm with the reason blank; then fill a reason and confirm.
- **Expected**:
  1. The consequence names the subject "QV20260042" (preset-driven copy).
  2. Confirmation is blocked until a reason is entered; then it succeeds and closes.
- **Automation notes**: presets bundle permission + consequence + reason/password requirements per `kind`. Sibling stories: `--stock-adjustment` (reason-required, no password) behaves identically.

### TC-CMP-14 — `force-logout` / `role-delete` presets demand a re-auth password
- **Target**: Storybook @ :6006 (`permission-guardedactiondialog--force-logout`)
- **Persona**: n/a
- **Preconditions**: story loaded; click "Trigger"
- **Priority**: high-risk
- **Steps**:
  1. Open the force-logout dialog (subject `jane@example.com`); attempt to confirm without a password.
  2. Enter a password and confirm.
  3. Repeat on `permission-guardedactiondialog--role-delete` (subject "Warehouse Clerk").
- **Expected**:
  1. Confirm is disabled/blocked until the re-auth password is entered.
  2. Confirm then succeeds and the dialog closes.
  3. Role-delete behaves the same (both presets are `requirePassword`).
- **Automation notes**: mirrors `guarded-action-dialog.test.tsx` "requires a re-auth password before confirming force-logout / role-delete".

### TC-CMP-15 — `payroll-approve` needs neither reason nor password, but is permission-gated
- **Target**: Storybook @ :6006 (`permission-guardedactiondialog--payroll-approve`)
- **Persona**: n/a (story provider is super-admin)
- **Preconditions**: story loaded; click "Trigger"
- **Priority**: permission-gate
- **Steps**:
  1. Open the payroll-approve dialog (subject "2026-07") and confirm immediately.
- **Expected**:
  1. Confirm is enabled with no reason/password inputs required (super-admin in the story provider) and closes on click.
- **Automation notes**: the denied branch — confirm disabled when the viewer lacks the preset's permission even with no reason/password — is unit-covered (`guarded-action-dialog.test.tsx`) but has **no story** with a non-super-admin provider. **FLAG**: add a "denied" story variant to make the gate visible in the workbench.

## Combobox & Select

### TC-CMP-16 — Combobox filters as you type and selects via keyboard
- **Target**: Storybook @ :6006 (`primitives-combobox--single`)
- **Persona**: n/a
- **Preconditions**: story loaded; options Acme Textiles / Borey Garments / Chan Weaving Co. / Delta Apparel (disabled)
- **Priority**: golden-path
- **Steps**:
  1. Click the trigger ("Pick a customer") to open the listbox.
  2. Type "chan".
  3. Press ArrowDown then Enter.
  4. Reopen and type "zzz".
- **Expected**:
  1. All four options list; "Delta Apparel" is disabled.
  2. Options filter to "Chan Weaving Co.".
  3. It is selected; the trigger now shows "Chan Weaving Co." and the popover closes.
  4. A no-results message shows when nothing matches.
- **Automation notes**: `getByRole("combobox")` / `getByRole("option", { name: … })`. Async loading state is covered by `primitives-combobox--async-search` (shows a loading indicator while options resolve); multi-select by `--multi`.

### TC-CMP-17 — Select opens with keyboard and commits the highlighted option
- **Target**: Storybook @ :6006 (`primitives-select--single`)
- **Persona**: n/a
- **Preconditions**: story loaded; trigger "Document type" shows default "QV — valued"
- **Priority**: smoke
- **Steps**:
  1. Verify the trigger renders the current value.
  2. Focus the trigger, press Enter (open), ArrowDown to "QNV — non-valued", Enter.
- **Expected**:
  1. Trigger shows "QV — valued" (value renders in trigger — unit-covered).
  2. Trigger updates to "QNV — non-valued"; the listbox closes.
- **Automation notes**: Radix Select — `getByRole("combobox", { name: "Document type" })`, options via `getByRole("option")` (portaled; query the document, not the story container).

## Wizard (Primitives/Wizard)

### TC-CMP-18 — Step header gates forward progress; back-jumps allowed
- **Target**: Storybook @ :6006 (`primitives-wizard--goods-receipt`)
- **Persona**: n/a
- **Preconditions**: story loaded on step "Lines" (steps: Lines → Landed cost → Confirm → Post)
- **Priority**: golden-path
- **Steps**:
  1. Try to click the "Confirm" and "Post" step headers from step 1.
  2. Click Continue twice (to "Confirm"); note the continue label.
  3. Click the "Lines" step header.
- **Expected**:
  1. Steps ahead of the active one are **disabled** — forward progress is not a header click.
  2. Body content updates per step; on the penultimate step the continue button reads "Post"; visited/current steps are marked done.
  3. Jumping **back** to an already-visited step works.
- **Automation notes**: step headers are buttons — assert `disabled` on future steps; `getByRole("button", { name: "Post" })` for the custom continue label.

### TC-CMP-19 — WizardNav blocks Continue on failed step validation
- **Target**: Storybook @ :6006 (`primitives-wizard--review-step-blocked`)
- **Persona**: n/a
- **Preconditions**: story loaded ("Add at least one line to continue." body, `continueDisabled`)
- **Priority**: high-risk
- **Steps**:
  1. Attempt to click Continue.
- **Expected**:
  1. Continue is disabled (per-step validation flag) — the wizard cannot advance past an invalid step.
- **Automation notes**: `expect(continueBtn).toBeDisabled()`. The enable-on-valid flip is exercised in-app by the goods-receipt wizard (module doc), not this static story.

## ScanField (Primitives/ScanField)

### TC-CMP-20 — Enter commits a scan with qty, clears the input; undo removes it
- **Target**: Storybook @ :6006 (`primitives-scanfield--goods-issue-loop`)
- **Persona**: n/a
- **Preconditions**: story loaded (stateful demo, unit "m", empty scan list)
- **Priority**: golden-path
- **Steps**:
  1. Press Enter with the code input blank.
  2. Type `FAB-BLK-001`, step the qty up twice (and once down), press Enter.
  3. Type `FAB-BLK-001` again with a different qty; press Enter.
  4. Click undo on the newest entry.
- **Expected**:
  1. Blank Enter is ignored — no entry appears.
  2. An entry `FAB-BLK-001` with the chosen qty appears in recent scans; the code input clears and keeps focus for the next scan; qty stepper floors at its minimum.
  3. A **second, separate** entry for the same code appears — ScanField itself does not merge/dedupe repeated codes (the recent list shows at most the last five).
  4. Undo removes exactly that entry.
- **Automation notes**: camera button renders only when `onCameraScan` is provided (it is here — clicking alerts). **FLAG**: the requested "dedupe" behavior is **not** a ScanField behavior per its tests/stories — aggregation of repeated scans belongs to the host flow (`apps/web` goods-issue screen); cover it in the inventory module doc instead.

## Toast (Primitives/Toast)

### TC-CMP-21 — Transient toast and job-toast that resolves in place
- **Target**: Storybook @ :6006 (`primitives-toast--playground`)
- **Persona**: n/a
- **Preconditions**: story loaded (buttons: "Show toast" / "With action" / "Run export (job toast)")
- **Priority**: golden-path
- **Steps**:
  1. Click "Show toast".
  2. Click "Run export (job toast)" and watch the toast for ~2s.
  3. Click "With action" and dismiss it via its close control.
- **Expected**:
  1. A success toast "Saved" appears and auto-dismisses.
  2. A job toast "Generating PDF" (progress/pending variant, "We'll notify you when it's ready.") appears, then **resolves in place** to "Invoice ready" (success tone) with a "Download" action — same toast, not a second one.
  3. "Payment recorded" toast shows description "฿16,520.00 applied to QV20260042." and a "View" action; the dismiss control (labelled via the `common` namespace) closes it.
- **Automation notes**: toasts portal to a region — `getByRole("status")`/toast viewport. For step 2 assert the toast count stays 1 across the transition. The 2s resolve is a story `setTimeout`; use `await expect(...).toHaveText(..., { timeout: 4000 })`.

## FormField (Primitives/FormField)

### TC-CMP-22 — Label, help, error, and required states wire the right ARIA
- **Target**: Storybook @ :6006 (`primitives-formfield--states`)
- **Persona**: n/a
- **Preconditions**: story loaded (fields: "Customer" required+help; "Tax ID" with error)
- **Priority**: smoke
- **Steps**:
  1. Inspect the "Customer" input's accessible name, `aria-required`, and `aria-describedby`.
  2. Inspect the "Tax ID" input.
- **Expected**:
  1. Clicking the label "Customer" focuses its input (`htmlFor`/`id` auto-wired); `aria-required` is set; `aria-describedby` points at the help text "Legal entity on the invoice."
  2. "Tax ID" has `aria-invalid` and its `aria-describedby` references the error "Tax ID must be 13 digits."; the error text is visible.
- **Automation notes**: `getByRole("textbox", { name: "Customer" })` then attribute assertions; resolve `aria-describedby` ids to elements and match text. This is pure-DOM — a Playwright accessibility snapshot also captures it.

## MoneyCell / QtyCell (Primitives/NumericCell)

### TC-CMP-23 — MoneyCell formats decimal strings with grouping, currency, danger negatives
- **Target**: Storybook @ :6006 (`primitives-numericcell--money`)
- **Persona**: n/a
- **Preconditions**: story loaded (values "53500.00", "1240.5", "-2000.00", "0", "16520.0000" w/o currency)
- **Priority**: smoke
- **Steps**:
  1. Read each rendered cell and its alignment/typeface.
- **Expected**:
  1. Values render grouped to the display scale via decimal.js from the **string** input (never a float) with the currency symbol, e.g. 53,500.00; the `currency=""` row omits the symbol.
  2. The negative renders in the danger tone **wrapped in parentheses** — (2,000.00).
  3. Cells are right-aligned in tabular figures.
- **Automation notes**: assert text content plus computed `text-align: right` / `font-variant-numeric: tabular-nums`. Formatting goes through `@erp/utils` `formatMoney` — exact symbol/scale per its config; pin the assertion to the grouped digits and parentheses.

### TC-CMP-24 — QtyCell renders unit-adjacent quantities, danger negatives
- **Target**: Storybook @ :6006 (`primitives-numericcell--quantity`)
- **Persona**: n/a
- **Preconditions**: story loaded (values 4250 ml, 12.5 pcs, -3 pcs, 4250 unitless)
- **Priority**: smoke
- **Steps**:
  1. Read each rendered cell.
- **Expected**:
  1. Quantity renders with its unit adjacent ("4,250 ml", "12.5 pcs"); the unitless row renders the number alone.
  2. "-3 pcs" renders in danger tone with parentheses, right-aligned tabular.
- **Automation notes**: same alignment assertions as TC-CMP-23. In the DataTable, these cells back `moneyColumn`/`qtyColumn` (see TC-CMP-01 fixture).

## Permission layer

### TC-CMP-25 — PermissionButton: denied is aria-disabled, swallows clicks, names the permission
- **Target**: Storybook @ :6006 (`permission-permissionbutton--denied-with-tooltip`)
- **Persona**: n/a (story provides a viewer lacking the permission)
- **Preconditions**: story loaded
- **Priority**: permission-gate
- **Steps**:
  1. Inspect the button's state; click it.
  2. Hover/focus it and read the tooltip.
  3. Open `permission-permissionbutton--granted` and click that button.
- **Expected**:
  1. Denied: `aria-disabled="true"` (still focusable/hoverable — not DOM-`disabled`) and the click is swallowed (no action fires).
  2. Tooltip names the **required permission** so the user knows what to request.
  3. Granted: fully interactive button; click fires. (Super-admin bypass is unit-covered.)
- **Automation notes**: assert `aria-disabled` rather than `toBeDisabled()`; tooltip is Radix — appears on focus too, which is the more reliable trigger in automation.

### TC-CMP-26 — MaskedValue redacts: real value never enters the DOM when masked
- **Target**: Storybook @ :6006 (`permission-maskedvalue--masked`)
- **Persona**: n/a (story viewer lacks the gating permission)
- **Preconditions**: story loaded
- **Priority**: permission-gate
- **Steps**:
  1. Inspect the masked rendering and search the DOM for the underlying value.
  2. Read the element's accessible description.
  3. Open `permission-maskedvalue--revealed` and compare; check `--cost-masked-stock-visible` for the split case.
- **Expected**:
  1. A redaction placeholder renders; the real value (e.g. a salary/cost figure) is **absent from the entire DOM**, not merely hidden with CSS.
  2. An accessible description names the required permission.
  3. Revealed shows the real value; the wrapper structure is identical masked vs revealed (stable layout — no reflow leak); the mixed story masks cost while stock qty stays visible.
- **Automation notes**: `expect(page.locator("body")).not.toContainText("<real value>")` is the key assertion — grab the expected value from the `--revealed` story first. Description via `aria-describedby`/`getByRole` description matcher.
