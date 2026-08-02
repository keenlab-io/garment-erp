# Inventory (M3) — UI test cases

UI test cases for the Inventory module (`/inventory/*`): item catalog, goods receipts, scan-first
goods issues (kiosk/Touch), stock counts & adjustments, barcode printing, and inventory reports.
Screens live in `apps/web/src/router/routes/inventory/`; feature components in `apps/web/src/inventory/components/`.

**Coverage checklist**

- [x] Smoke: items list renders (TC-INV-01)
- [x] Golden path: create item → item detail → create SKU (TC-INV-02)
- [x] Goods-receipt wizard: lines → landed cost → review → create & confirm → post (TC-INV-03)
- [x] High-risk: kiosk goods-issue scan loop (TC-INV-04) + insufficient-stock / empty guards (TC-INV-05)
- [x] High-risk: stock count create → count lines → reconcile → approve → post (TC-INV-06)
- [x] High-risk: manual adjustment create → approve → post (TC-INV-07)
- [x] Permission gate: `inventory.adjustment.approve` denied (TC-INV-08)
- [x] Permission gate: nav subset + cost masking without `inventory.cost.view` (TC-INV-09)
- [x] Barcode print dialog + barcodes page (TC-INV-10)
- [x] Inventory reports: stock card / valuation / low stock / dead stock (TC-INV-11)

**Persona setup note (applies to every non-super-admin case).** In the running app,
`VITE_DEV_PERMISSIONS` is **not** honoured — it only shapes the dev user inside Vitest unit tests
(`main.tsx` always injects the real restored session). A limited persona must be a **real user**:
as `superadmin`, create a role at `/admin/roles` → "Create role" (tick exactly the case's permission
CSV in the permission matrix), create a user at `/admin/users` → "Create user" (username, email,
roles, temporary password), sign out, sign in as that user. **Flagged test-data gap:** there is no
seeded limited persona or scripted fixture for this — each permission-gate run pays the manual
Admin-UI setup cost (or needs a seed extension).

---

### TC-INV-01 — Items list smoke: route loads and key elements render
- **Target**: App @ :5173 `/inventory/items`
- **Persona**: super-admin
- **Preconditions**: logged in as `superadmin`; API + Postgres up (`pnpm dev`, seeded DB)
- **Priority**: smoke
- **Steps**:
  1. Navigate to `/inventory/items` (sidebar: Inventory → Items).
  2. Observe the page header, toolbar, and table.
- **Expected**:
  1. Heading "Items" and a "Create item" button are visible.
  2. A `role="grid"` DataTable renders with columns: Code, Name, Type, Standard cost, Min stock, Health (or the skeleton then rows; empty DB shows "No items yet.").
  3. Type filter chips render as a `role="group"` of toggle buttons: "All types", "Raw", "Finished", "Consumable" — "All types" has `aria-pressed="true"`.
  4. Cursor pagination controls render; Next is disabled when `next_cursor` is null.
- **Automation notes**: `getByRole("heading", { name: "Items" })`, `getByRole("button", { name: "Create item" })`, `getByRole("grid")`, filter chips via `getByRole("button", { name: "Raw" })` + `aria-pressed`. Table has `tableId="inventory-items"` (column presets persist to localStorage under it) but no DOM `data-testid` — flag: row-level test ids would help Playwright target rows other than by cell text.

### TC-INV-02 — Golden path: create item, open detail, create SKU
- **Target**: App @ :5173 `/inventory/items` → `/inventory/items/$id`
- **Persona**: super-admin
- **Preconditions**: TC-INV-01 passes; know a valid base UOM id (from seed — the create drawer's hint says the contract has no UOM catalog endpoint, so the id is typed directly)
- **Priority**: golden-path
- **Steps**:
  1. Click "Create item". A drawer titled "Create item" opens.
  2. Fill "Name" (e.g. `Test Fabric Roll`), leave "Type" = "Raw", fill "Base UOM ID" with a valid UOM id, leave "Costing method" = "Moving average", fill "Standard cost" `12.5`, "Min stock" `10`.
  3. Click "Create item" (submit).
  4. In the new row, open the row-action menu and click "View".
  5. On the detail page, click the "SKUs" tab.
  6. Fill "Variant" (e.g. `Blue / L`) and "Barcode" (e.g. `8850000000017`), click "Create SKU".
- **Expected**:
  1. Drawer fields: Name, Type (select), Base UOM ID (with hint "The contract has no UOM catalog endpoint yet — enter the UOM's id directly."), Costing method, Standard cost, Min stock; footer "Cancel" / "Create item".
  2. Success toast "Item created"; drawer closes; the row appears in the grid with the entered Code auto-generated (mono, link-ink) and Name.
  3. URL becomes `/inventory/items/<id>`; back-link "Back to items"; tabs "Overview", "SKUs", "Lots", "Stock card", "BOM"; Overview shows Code/Name/Type/Costing method/Standard cost/Minimum stock.
  4. SKUs tab shows note "The contract has no SKU-listing endpoint yet — this shows only SKUs created in this session." and, after submit, toast "SKU created" and the new SKU listed with its Variant and Barcode.
- **Automation notes**: Drawer via `getByRole("dialog")`; fields by `getByLabelText`. Selects are Radix — open via `getByRole("combobox", { name: "Type" })` then `getByRole("option", …)`. Item id for deep-linking is only obtainable from the row's View navigation (no id shown in the grid) — flag: exposing the item id (e.g. `data-row-id`) would let automation deep-link. Note the detail page 404-fallback: "This item isn't on the first page of the items list — go back and open it from there." (detail is resolved from the first list page — a contract gap worth knowing when the list grows past one page).

### TC-INV-03 — Goods-receipt wizard: receive → confirm → post
- **Target**: App @ :5173 `/inventory/receipts`
- **Persona**: super-admin (create/confirm/post need `inventory.receipt.manage`)
- **Preconditions**: at least one item exists (TC-INV-02); a supplier id string to enter (free text — no supplier catalog endpoint)
- **Priority**: golden-path
- **Steps**:
  1. Navigate to `/inventory/receipts`; click "New receipt".
  2. Wizard step "Lines": fill "Supplier ID", pick an "Item" in the line's combobox, fill "Receiving UOM ID" (the item's base UOM id), "Qty" `100`, "Unit price" `12.5`. Optionally toggle "Received in a non-base UOM?" and fill "Receiving qty" / "Base UOM equivalent qty" / "Base UOM label" to exercise the dual-UOM display.
  3. Click "Continue" to step "Landed cost": choose "Allocation method" ("By value" / "By weight" / "By quantity") and fill "Freight / import total" `500`.
  4. Click "Continue" to step "Review"; verify "Review lines"; click "Create & confirm receipt".
  5. On the receipts list, find the new row; open its row-action menu and click "Post".
- **Expected**:
  1. Wizard shows the three steps "Lines", "Landed cost", "Review"; "Continue" is disabled until every line has item + UOM + qty + unit price ("Add at least one line before continuing.").
  2. Landed-cost step shows a live per-line allocation preview (columns Item / Qty / "Allocated landed cost" / "New unit cost", "Total allocated" footer).
  3. Toast `Receipt <code> created and confirmed`; the row's Status chip shows "Confirmed" (pending-style InkChip). A row created only as DRAFT would instead offer a "Confirm" row action first.
  4. After "Post": toast "Receipt posted"; Status chip becomes "Posted". "Landed cost" column shows the money value (visible to super-admin), "Allocation" shows the chosen method.
- **Expected (side-effect)**: `/inventory/reports` → Valuation now includes the received qty/value (report queries are invalidated on post).
- **Automation notes**: wizard drawer via `getByRole("dialog")`; steps by their visible labels. Row actions live behind the DataTable's per-row menu (Radix popover) — open via the row's actions button then `getByRole("menuitem"| "button", { name: "Post" })`. Flag: receipt `code` is generated server-side; capture it from the toast text to relocate the row.

### TC-INV-04 — High-risk: kiosk goods-issue scan-first loop
- **Target**: App @ :5173 `/inventory/issues` (kiosk route — Touch density auto-applied, non-overridable)
- **Persona**: super-admin (posting needs `inventory.issue.manage`)
- **Preconditions**: TC-INV-03 posted stock for a known item; note that item's **code** (the scan resolves against item `code` — there is no barcode-lookup endpoint)
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/inventory/issues`.
  2. Verify `<html data-density="touch">` while on this route; open the density toggle in the top bar and confirm it cannot override here; navigate away and confirm density reverts.
  3. Set "Purpose" (select: "Production" / "Sale" / "Other"); optionally fill "Work order ID (optional)".
  4. Focus lands in the scan input (placeholder "Scan or enter a code"). Type the item code and press **Enter**.
  5. Repeat with the same code a second time (qty stepper at default `1`).
  6. Click "Undo" on one entry under "Last scans".
  7. Click "Post issue".
- **Expected**:
  1. Heading "Goods issues"; the route renders inside normal chrome (kiosk **density** only — no lockdown here, unlike production scan).
  2. Enter commits the scan: an entry with the code + qty appears at the top of "Last scans" (max 5 shown) and the input refocuses and clears for the next scan (the HID-wedge loop never needs a tap back in).
  3. Scanning the same code twice produces **two separate entries** — **flagged gap:** the shared-context claim "ScanField dedupes" is not implemented; neither `ScanField` nor this screen merges duplicate codes into one line with summed qty. Treat current behavior (duplicate lines) as as-built, and flag for product decision.
  4. Undo removes exactly that entry.
  5. "Post issue" drafts then posts in one step; success toast "Issue posted"; the scan list clears.
- **Automation notes**: scan input by placeholder (`getByPlaceholderText("Scan or enter a code")`) — flag: no `data-testid`; qty stepper buttons have aria-labels "Decrease quantity"/"Increase quantity"; "Add" button is the non-Enter path. Assert density via `document.documentElement.dataset.density === "touch"`.

### TC-INV-05 — High-risk: goods-issue guards — empty post and insufficient stock
- **Target**: App @ :5173 `/inventory/issues`
- **Persona**: super-admin
- **Preconditions**: an item with known low on-hand (e.g. 5 units posted via a small receipt)
- **Priority**: high-risk
- **Steps**:
  1. With no scans committed, click "Post issue".
  2. Scan an unknown/garbage code (e.g. `NOPE-123`) and press Enter.
  3. Scan the low-stock item, set qty above on-hand (use the "+" stepper or type), press Enter, then click "Post issue".
- **Expected**:
  1. Danger toast "Scan at least one item before posting." — nothing is created.
  2. Danger toast `No item found with code "NOPE-123"`; no entry added.
  3. The API 422s; an inline danger banner renders: `Insufficient stock — only <remaining> <item name> left` (exact remaining qty from the error `details`) — not a generic error toast. The scan list is **kept** so the operator can adjust and retry.
- **Automation notes**: toast region via `role="status"`/`aria-live`; the insufficient-stock banner is a `<p>` with danger styling — flag: a `data-testid="insufficient-stock"` would make this assertion robust; currently match on the "Insufficient stock —" text prefix.

### TC-INV-06 — High-risk: stock count — open → count lines → reconcile → approve → post
- **Target**: App @ :5173 `/inventory/counts`
- **Persona**: super-admin (open/save need `inventory.issue.manage`; approve/post need `inventory.adjustment.approve`)
- **Preconditions**: items with posted stock (TC-INV-03)
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/inventory/counts`. Verify the empty state "No open count — start one below."
  2. Fill "Period" (e.g. `2026-07`), pick 2 items in the "Items to count" multi-combobox, click "Open count".
  3. In the count table, for each line enter a "Counted qty" that differs from "System qty" (one over, one under). Click "Save counts".
  4. Click "Reconcile"; confirm the dialog.
  5. In the "Adjustment drafted" section, click "Approve adjustment"; in the guarded dialog type a reason and confirm.
  6. Click "Post adjustment".
- **Expected**:
  1. Toast "Count opened"; table renders columns Item / "Locked for counting" / "System qty" / "Counted qty"; every line carries the hold-style InkChip "Locked for counting" (sr-only text: "Movement is disabled while this item is part of an open count."). Note "The contract has no count-listing endpoint — only the count opened in this session is shown."
  2. Toast "Counts saved" after save.
  3. Confirm dialog: title "Reconcile this count?", consequence "This drafts a stock adjustment for the counted differences." After confirm, the "Reconcile" button disables and an "Adjustment drafted" section appears listing each variance line with its signed qty delta (QtyCell) and the reason.
  4. Approve opens the `stock-adjustment` GuardedActionDialog: title `Approve stock adjustment <reason>?`, consequence "This posts adjustment …'s lines to on-hand stock.", **required reason** (blank blocks with inline error), confirm label "Approve adjustment". On confirm: toast "Adjustment approved"; the button switches to "Post adjustment".
  5. Post → toast "Adjustment posted".
- **Expected (side-effect)**: `/inventory/reports` Valuation / stock card for the counted items reflect the deltas (report queries invalidated on post).
- **Behavioural check (flag if it fails)**: while the count is open, try posting a goods issue for a locked item — movement should be blocked server-side (the UI communicates the lock via the chip only).
- **Automation notes**: count state is session-local (no list endpoint) — a page reload **loses** the open count/adjustment UI state; run this case in one continuous session. Dialogs via `getByRole("alertdialog"|"dialog")`; the reason field inside GuardedActionDialog by its label.

### TC-INV-07 — High-risk: manual stock adjustment — create → approve → post
- **Target**: App @ :5173 `/inventory/adjustments`
- **Persona**: super-admin
- **Preconditions**: at least one item exists
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/inventory/adjustments`.
  2. Leave "Reason" blank; pick an "Item" and set "Qty delta" `-2`; click "Create adjustment".
  3. Fill "Reason" (e.g. `Damaged in storage`), click "Create adjustment" again.
  4. Click "Approve"; complete the guarded dialog (reason required) and confirm.
  5. Click "Post".
- **Expected**:
  1. Empty state below the form initially: "No adjustment created this session yet."
  2. Blank reason blocks submit with the inline field error "A reason is required." — no request fires.
  3. Toast "Adjustment created"; the form resets; an adjustment card renders the reason + each line's qty delta; because status is DRAFT, an "Approve" PermissionButton shows.
  4. GuardedActionDialog (`stock-adjustment` preset, same as TC-INV-06 step 4). Toast "Adjustment approved"; button becomes "Post".
  5. Toast "Adjustment posted"; note (flag) the session-store gap: "The contract has no adjustment-listing endpoint — only the adjustment created in this session is shown", so reload loses the card.
- **Automation notes**: line controls by label ("Item" combobox, "Warehouse ID (optional)", "Qty delta"); "Add line"/"Remove" manage rows; "Remove" is disabled when only one line remains.

### TC-INV-08 — Permission gate: adjustment approve denied without `inventory.adjustment.approve`
- **Target**: App @ :5173 `/inventory/adjustments`
- **Persona**: `inventory.issue.manage,inventory.product.create` (no `inventory.adjustment.approve`, no `inventory.cost.view`)
- **Preconditions**: limited user created via Admin UI per the persona setup note above (role + user + login) — **flagged gap: no seeded limited persona**
- **Priority**: permission-gate
- **Steps**:
  1. As the limited user, create an adjustment with a reason and one line (per TC-INV-07 steps 3).
  2. Hover/focus the "Approve" button; attempt to click it.
- **Expected**:
  1. Creation succeeds (gated by `inventory.issue.manage` on this screen).
  2. "Approve" renders as the disabled-with-tooltip pattern: `aria-disabled="true"`, ~50% opacity, click swallowed, tooltip "Requires inventory.adjustment.approve". The action is **disabled, not hidden** (contrast with nav absence in TC-INV-09). Even if the dialog were opened, GuardedActionDialog's confirm stays disabled without the permission (defense in depth).
- **Automation notes**: assert `aria-disabled` (not native `disabled` — the button stays focusable so the tooltip can fire); tooltip content appears on hover/focus via Radix (`getByRole("tooltip")`).

### TC-INV-09 — Permission gate: nav subset + cost masking for a warehouse persona
- **Target**: App @ :5173 `/inventory` and children
- **Persona**: `inventory.issue.manage` only
- **Preconditions**: limited user via Admin UI (see setup note; **flagged gap: manual setup**)
- **Priority**: permission-gate
- **Steps**:
  1. Sign in as the limited user; inspect the sidebar's Inventory section, the command palette (Ctrl/Cmd-K), and navigate to `/inventory`.
  2. Directly enter `/inventory/items` and `/inventory/receipts` in the URL bar.
  3. Open `/inventory/reports` → "Valuation" tab.
- **Expected**:
  1. Sidebar shows Inventory with **only** "Goods issues", "Stock counts", "Stock adjustments", "Reports" (per the nav registry: items & barcodes need `inventory.product.create`, receipts needs `inventory.receipt.manage`). The same subset — and nothing more — appears in the command palette. `/inventory` redirects to the first accessible child (`/inventory/issues`).
  2. Unpermitted routes are absent, not disabled: direct navigation to `/inventory/items` or `/inventory/receipts` redirects away (route gate parity with nav/palette).
  3. Valuation's "Avg cost" and "Value" cells and the "Total value" footer render as MaskedValue: a lock icon + `••••` with sr-only "Restricted — requires inventory.cost.view" — the real figure is **not present in the DOM**. "Qty on hand" stays visible. (Same masking applies to "Standard cost" on the items list and "Landed cost" on receipts for personas that can see those screens.)
- **Automation notes**: masked cells: assert absence of the money text and presence of `••••`; sr-only description is inside the same span. Route-redirect assertion: wait for final URL, not the transient one.

### TC-INV-10 — Barcode printing: page form and items-list bulk dialog
- **Target**: App @ :5173 `/inventory/barcodes` and `/inventory/items`
- **Persona**: super-admin
- **Preconditions**: a SKU id from TC-INV-02 (copy it from the SKUs tab); Redis up (label job is queued via BullMQ)
- **Priority**: golden-path
- **Steps**:
  1. Navigate to `/inventory/barcodes`. Click "Print barcodes" with both fields empty.
  2. Fill "SKU IDs" with the SKU id (comma-separated list allowed), click "Print barcodes".
  3. On `/inventory/items`, select one or more rows (checkbox/space on a roving-tabindex row) and use the magenta bulk bar's "Print barcodes" action; also try "Export CSV".
- **Expected**:
  1. Inline field error "Enter at least one SKU or lot id." — nothing queued.
  2. A job toast runs: "Queuing label job…" → resolves "Label job started" / "You'll be notified when the labels are ready." (**flag:** fire-and-forget — the contract has no label-job status endpoint, so the toast can't track completion). Fields clear on success.
  3. Selecting rows raises the bulk-selection bar with the two actions; "Print barcodes" opens the shared BarcodePrintDialog (same id-entry approach); "Export CSV" downloads `items.csv` with header `code,name,item_type,min_stock`.
- **Automation notes**: job toast passes through two states — assert the final text with a generous timeout. CSV download via Playwright's download event.

### TC-INV-11 — Inventory reports: stock card ledger, valuation, low stock, dead stock
- **Target**: App @ :5173 `/inventory/reports`
- **Persona**: super-admin
- **Preconditions**: an item with movements (receipt posted TC-INV-03, issue posted TC-INV-04, adjustment posted TC-INV-06/07)
- **Priority**: high-risk
- **Steps**:
  1. Open `/inventory/reports`. Confirm the tablist: "Stock card", "Valuation", "Low stock", "Dead stock".
  2. Stock card tab: before picking an item observe the prompt; then pick the item in the "Item" combobox and optionally narrow "From"/"To".
  3. Valuation tab: optionally set "As of"; read the table.
  4. Low stock tab: read rows (create an item whose min stock exceeds its on-hand to guarantee one).
  5. Dead stock tab: set "Months with no movement" to `1`; read rows.
- **Expected**:
  1. `role="tablist"`/`role="tab"` with `aria-selected` moving on click.
  2. Prompt "Select an item to view its stock card." Then the ledger renders columns Date / Ref / In / Out / Balance / Unit cost with an "Opening balance" first row and "Closing balance" last row; Ref types display as "Goods receipt" / "Goods issue" / "Backflush" / "Adjustment" / "Count"; the running Balance is consistent with In/Out arithmetic across rows (verify at least: opening + Σin − Σout = closing).
  3. Valuation columns Item / "Qty on hand" / "Avg cost" / Value with a "Total value" footer; Σ(row Value) equals Total value.
  4. Low-stock rows show the item, on-hand qty, and the "Low stock" health chip; only items where on-hand ≤ min stock appear (the items list reuses this feed for its Health column).
  5. Dead-stock rows show qty on hand + "Last movement" date (or "Never"); the freshly-moved item is absent at months=1 only if its movement is older — assert on a known-stale seeded item, else assert the empty state "No rows."
- **Automation notes**: ledger table is a plain `<table>` — target with `getByRole("table")` scoped to the active tabpanel. Also re-run Valuation as the TC-INV-09 persona to confirm masking there.
