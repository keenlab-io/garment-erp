# data-table

## ADDED Requirements

### Requirement: Shared Data Table organism
`@erp/ui` SHALL provide one Data Table organism, built on TanStack Table (headless), that every module list screen uses. It composes: sticky header, sortable columns, row actions, bulk-selection bar, pagination, a search/filter bar slot, and a density toggle — all styled from semantic tokens. Modules configure it via typed column definitions; they do not build their own tables.

#### Scenario: Sticky header under scroll
- **WHEN** a table body scrolls
- **THEN** the header row remains pinned at the top (at `--z-sticky`) with sort controls usable

#### Scenario: Column sorting
- **WHEN** the user activates a sortable column header
- **THEN** the sort indicator cycles asc → desc → none and the table emits the sort state for the data layer to apply

### Requirement: Cursor pagination matching the contract shape
The table's pagination SHALL consume the contract list shape `{ data, next_cursor }` from `@erp/contracts` (cursor-based, not offset), exposing "load next page" behavior driven by `next_cursor` and rendering an end-of-list state when it is null.

#### Scenario: Next page via cursor
- **WHEN** a page result carries a non-null `next_cursor`
- **THEN** the table offers a next-page action that requests the following page with that cursor

#### Scenario: End of list
- **WHEN** `next_cursor` is null
- **THEN** no further page is requested and the pagination affordance indicates the end

### Requirement: Density-aware rows and columns
Row height, cell padding, and font size SHALL derive from the density tokens (40/32/64px rows). In Touch density the table additionally hides columns marked `secondary` in the column definition, so floor/tablet views show only essential columns.

#### Scenario: Density switch resizes rows
- **WHEN** density changes from Comfortable to Compact
- **THEN** row height re-resolves from 40px to 32px without remounting the table

#### Scenario: Touch hides secondary columns
- **WHEN** Touch density is active
- **THEN** columns flagged as secondary are not rendered and remaining columns reflow to fill the width

### Requirement: Money and quantity columns
Column definitions SHALL support money/qty column types that render via the shared Money/Qty cells: `--font-numeric` tabular figures, right-aligned, unit/currency adjacent, string-sourced through `@erp/utils` with no float parsing, negative money in danger + parentheses.

#### Scenario: Money column alignment
- **WHEN** a money column renders a page of rows
- **THEN** every amount is right-aligned in tabular numerals so decimal points align vertically down the column

### Requirement: Row and bulk actions
The table SHALL support per-row actions (menu or inline, tap-accessible in Touch) and multi-row selection with a bulk-action bar that appears when one or more rows are selected, showing the selected count and the available bulk actions. Keyboard support: arrow keys move the active row, space toggles selection.

#### Scenario: Bulk bar appears on selection
- **WHEN** the user selects two rows
- **THEN** a bulk-action bar appears showing "2 selected" and the configured bulk actions; clearing the selection dismisses it

#### Scenario: Keyboard row selection
- **WHEN** the user presses arrow-down then space
- **THEN** the active row moves and toggles selected without using the pointer

### Requirement: Saved column presets
Users SHALL be able to save, apply, and reset named column presets (visibility, order, sort) per table identity. Presets persist across sessions for the same user on the same client (local persistence in M0; server-side saved views are a later module concern).

#### Scenario: Preset round-trip
- **WHEN** a user hides two columns, saves the preset, and reloads the app
- **THEN** reopening the same table restores the saved visibility and sort

### Requirement: Loading, empty, and error states
Initial load SHALL render skeleton rows in the table layout (not a spinner); every table accepts an empty-state slot (one-line explanation + primary CTA) and an error state with a cause and a Retry action.

#### Scenario: Skeleton rows on first load
- **WHEN** the table's first page is loading
- **THEN** skeleton table-row primitives render in place of data rows, preserving column layout

#### Scenario: Empty state with CTA
- **WHEN** a query resolves to zero rows
- **THEN** the configured empty state renders with its explanation and primary action instead of an empty grid
