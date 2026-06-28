# UX/UI Specification — Integrated Manufacturing & Sales ERP
### Modules M1–M6 · Design-Direction & Token-Ready · v1.0

> Companion to *ERP Implementation Spec v1.0* and *Backend Spec M1–M6*. This document is the **UX contract**: information architecture, user flows, screen layouts, component inventory, interaction/state specs, and the **design-direction inputs + token scaffold** needed to derive a visual system. It is implementation-agnostic but written for React + a headless UI layer (Radix/shadcn) per the tech decision.
>
> **How to use:** Part A defines the shared foundation and the design tokens the whole product inherits. Part B specifies each module against that foundation. Part C gives build order. Hand Part A to *frontend-design* first to lock direction + tokens, then build modules from Part B.

---

# PART A — Shared Foundation

## A1. Product Context & Design Goals

**What it is:** A vertically-integrated ERP for a made-to-order apparel / textile-printing manufacturer (Sublimation / DTF / DTG) — from access control and HR/payroll, through raw-material inventory and production costing, real-time shop-floor tracking, Thai-tax sales documents, to executive dashboards.

**The defining UX tension:** one system spans three very different *contexts of use* on three device classes:

| Context | Where | Device | UX demand |
|---|---|---|---|
| **Back-office** | accounting, sales, HR desks | desktop | dense data, keyboard speed, precision, audit clarity |
| **Shop floor** | print/cut/sew/QC stations | wall/handheld tablet, gloved hands | glanceable status, huge touch targets, scan-first, minimal typing |
| **On-the-go** | managers, owner | smartphone | summaries, approvals, alerts |

A single visual system must flex across all three without forking. This drives the **density-mode** and **touch-target** token decisions below.

**Design goals (in priority order — the UX hierarchy of needs):**
1. **Correct & trustworthy** — financial/stock numbers read unambiguously; destructive/irreversible actions are guarded; the system's state is always visible.
2. **Fast for repeat work** — the office user does the same 5 tasks hundreds of times/day; minimize clicks, support keyboard + bulk actions.
3. **Glanceable on the floor** — production status legible across a room; scanning beats typing.
4. **Calm under data load** — heavy tables and dashboards stay scannable, never noisy.

## A2. Personas & Top Tasks

| Persona | Role | Skill / context | Top tasks |
|---|---|---|---|
| **Owner / GM** | approvals, oversight | low patience, mobile-first, glances | Approve cash advance/payroll, read profit/stock dashboards, spot delays |
| **Accountant** | M5 + tax + payroll | expert, desktop, precision-critical | Issue invoices/tax docs, run payroll, export PP.30, reconcile WHT |
| **Sales staff** | M5 | moderate, desktop | Quote → convert → invoice, track payment/aging, customer lookup |
| **Warehouse staff** | M3 | moderate, desktop + handheld scanner | Receive goods, issue materials, stock count, print barcodes |
| **Production lead** | M4 | moderate, desktop + floor tablet | Create work orders, watch timeline, reassign, clear bottlenecks |
| **Floor operator** | M4 | low digital literacy, gloves, tablet | Scan start/finish, flag defect — nothing else |
| **HR officer** | M2 | moderate, desktop | Manage employees, OT/advance approvals, payroll prep |
| **Super Admin / IT** | M1 | expert | Roles/permissions, force-logout, audit review |

**Reference products & what to learn (anchors direction, prevents generic output):**
- **Linear** — keyboard-first speed, command palette, restrained dense aesthetic → adopt for office power-users.
- **Stripe Dashboard** — financial legibility, number formatting, status semantics → adopt for M5/M6.
- **Notion / Airtable** — flexible, scannable data tables with inline editing → adopt for M3 master data.
- **Tulip / shop-floor MES** — oversized status tiles, scan-driven, color-coded glanceability → adopt for M4 floor mode.
- **Xero / QuickBooks** — document fidelity, tax-field clarity, audit trail surfacing → adopt for M5 documents.

## A3. Global Information Architecture

### Navigation model
**Sidebar + Top bar** (desktop/tablet) collapsing to **bottom tab bar + drawer** (mobile). Chosen because this is a data-heavy, multi-section admin product (per the IA pattern table). A **command palette (Cmd/Ctrl-K)** is first-class for office power-users.

```
Primary sidebar (role-filtered — users only see modules they have permission for):
  ⌂  Dashboard            (M6 overview / role-specific landing)
  ▣  Inventory            (M3)
  ⚙  Production           (M4)
  ⧉  Sales                (M5)
  ◷  HR & Payroll         (M2)
  ▤  Reports              (M6)
  ────────────────────
  ⚿  Admin & Access       (M1)   (Super Admin only, bottom-anchored)
  ⚙  Settings                     (bottom-anchored)

Top bar (persistent):
  [Breadcrumb / page title]      [Global search ⌘K] [Scan ⎙] [Notifications •] [Lang TH/EN] [Avatar ▾]
```

- **Role-aware nav:** the sidebar renders only permitted modules; a permission-gated item never appears greyed — it's absent (recognition over recall; avoids teasing locked features). Sub-actions inside a module *are* shown disabled-with-tooltip when contextually relevant.
- **Landing screen is role-based:** owner → profit/alerts dashboard; floor operator → scan screen; accountant → sales worklist.
- **Scan affordance** (⎙) in the top bar is globally available on touch/handheld contexts — opens the scan overlay from anywhere.

### Screen-type taxonomy (reused across modules)
Every module is built from a small set of repeating screen archetypes, so patterns transfer: **List/Browse** (CRUD table), **Detail** (record + tabs + timeline), **Create/Edit form** (sectioned, sticky footer), **Wizard** (multi-step posting flows), **Board/Timeline** (M4), **Document editor + preview** (M5), **Dashboard** (M6), **Scan/Kiosk** (M4 floor).

## A4. Design Direction Inputs

This section is the brief a designer (or *frontend-design*) turns into a visual identity. It defines *intent*, not final pixels.

### Product personality
**Calm · precise · industrial-trustworthy.** This is a factory-and-finance tool, not a consumer app. Confidence comes from clarity and consistency, not decoration. Visual voice sits between *Linear's engineered restraint* and *Stripe's financial seriousness*, with a *shop-floor pragmatism* layer for M4. Avoid: playful illustration, gradients-as-identity, trendy ornament, anything that reduces number legibility.

### Design principles (apply throughout)
1. **Numbers are the hero.** Tabular figures, right-aligned money, consistent decimal places, currency/unit always adjacent. Never let chrome compete with data.
2. **Status is a first-class visual language.** A small, fixed semantic palette (success/warning/danger/info + the production-status set) used *identically* everywhere; never color-only — always color + icon + label.
3. **Three densities, one system.** The same components reflow between Comfortable / Compact / Touch via density tokens — not separate designs.
4. **Guard the irreversible.** Void, delete, force-logout, payroll-approve get elevated treatment: confirmation, reason capture, re-auth where specified. Visual weight matches consequence.
5. **Progressive disclosure.** Lead with the primary task; push secondary fields/actions into menus, drawers, and "advanced" sections.
6. **Bilingual by construction.** Thai-first UI with English technical labels; layout tolerates Thai's taller line-box and space-less wrapping, and ~30% text expansion when switching TH↔EN.

### Motion & feedback
Purposeful, quick (150–250ms), never decorative. Motion communicates state change (row commit, status flip, toast in/out, drawer slide). Respect `prefers-reduced-motion`. Realtime updates (production timeline, dashboards) animate *in* softly so the eye catches the change without jarring.

### Tone of voice (microcopy)
Plain, direct, action-oriented. Errors say what happened + how to fix. Confirmations state the consequence ("This voids invoice QV20260042 and posts a reversing stock entry"). No cute empty-state jokes in financial contexts.

## A5. Design Token Scaffold

Token-ready starting values. Names are semantic (role-based), not literal, so themes can re-map them. Organized for a Style-Dictionary / CSS-custom-property pipeline. Hex values are a **proposed starting point** consistent with the existing document brand (deep navy + blue); the designer may retune within the stated intent.

### A5.1 Color — primitives (raw scale, never used directly in components)
```
--navy-50  #EEF2F8   --navy-100 #D7E0EE   --navy-200 #AEC1DD   --navy-300 #7E9BC4
--navy-400 #4E6FA3   --navy-500 #2E75B6   --navy-600 #235C92   --navy-700 #1F3864  (brand anchor)
--navy-800 #182B4D   --navy-900 #101D34
--slate-50 #F7F9FB   --slate-100 #EDF1F5 --slate-200 #DCE3EB  --slate-300 #C2CCD8
--slate-400 #94A3B5  --slate-500 #6B7A8D --slate-600 #4D5A6B  --slate-700 #36414F
--slate-800 #232B36  --slate-900 #141A22
--green-500 #2E7D32  --amber-500 #B7791F  --red-500 #B23A48  --blue-500 #2E75B6
--green-50 #E8F3E9   --amber-50 #FBF3E3   --red-50 #F8E9EB   --blue-50 #E9F1F9
```

### A5.2 Color — semantic roles (what components consume)
```
# Brand / interactive
--color-brand            navy-700      # primary identity, headers
--color-accent           navy-500      # primary action, links, focus
--color-accent-hover     navy-600
--color-accent-subtle    navy-50       # selected-row tint, accent backgrounds

# Surfaces (elevation by lightness, not just shadow)
--color-bg-app           slate-50      # app canvas
--color-bg-surface       #FFFFFF       # cards, tables, panels
--color-bg-surface-raised #FFFFFF + elevation-md
--color-bg-sunken        slate-100     # wells, code, read-only zones
--color-bg-paper         #FFFFFF       # document/PDF preview surface (M5) — pure white, ruled

# Text
--color-text-primary     slate-800
--color-text-secondary   slate-600
--color-text-muted       slate-400
--color-text-inverse     #FFFFFF
--color-text-link        accent

# Lines
--color-border           slate-200
--color-border-strong    slate-300
--color-border-focus     accent

# Semantic (status) — each has solid + subtle(bg) + text-on-subtle
--color-success / -subtle / -on   green-500 / green-50 / #1B5E20
--color-warning / -subtle / -on   amber-500 / amber-50 / #7A5212
--color-danger  / -subtle / -on   red-500 / red-50 / #7F2530
--color-info    / -subtle / -on   blue-500 / blue-50 / #1A4E7A
```

### A5.3 Color — production-status set (M4, but a shared token group)
A fixed, learnable mapping. **Always paired with an icon + label**, never color alone (accessibility + glanceability across a room).
```
--status-pending      slate-400   icon: ○ (hollow)     label: Pending
--status-in-progress  blue-500    icon: ◐ (half)       label: In Progress
--status-completed    green-500   icon: ● (filled-check) label: Completed
--status-delayed      red-500     icon: ▲ (alert)      label: Delayed
--status-hold         amber-500   icon: ❙❙ (pause)     label: On Hold
--status-outsourced   navy-500    icon: ↗ (external)   label: Subcontracted
```
Document-status (M5) and stock-health (M3) reuse the semantic set: Draft=muted, Issued/Approved=info, Paid/Posted=success, Overdue/Low=danger, Partial/Near-min=warning, Void=muted+strikethrough.

### A5.4 Typography
```
# Families — Thai+Latin coverage is mandatory; tabular numerals required for data
--font-sans   "IBM Plex Sans Thai", "Noto Sans Thai", "Sarabun", system-ui, sans-serif
--font-mono   "IBM Plex Mono", "Sarabun", ui-monospace, monospace   # codes, IDs, ledger
--font-numeric  font-sans with `font-variant-numeric: tabular-nums`  # all money/qty columns

# Type scale (rem; 16px base) — display→caption
--text-display  28 / 700      --text-h1  22 / 700     --text-h2  18 / 600
--text-h3       16 / 600      --text-body 14 / 400    --text-body-strong 14 / 600
--text-sm       13 / 400      --text-caption 12 / 500 --text-mono 13 / 450

# Line-height — Thai needs MORE room than Latin (upper/lower vowel & tone marks)
--leading-tight  1.35   (numbers, table cells)
--leading-normal 1.6    (Thai body — do NOT go below 1.5 or marks collide)
--leading-relaxed 1.75  (long-form Thai paragraphs)
```
**Thai typesetting notes for the designer:** Thai has no inter-word spaces → rely on the browser/ICU word-breaker; avoid `text-align: justify` (creates rivers in Thai); never letter-spacing Thai; reserve ~1.6 line-height minimum; test ascender/descender clipping in dense table rows (may need 32px min row height in Comfortable).

### A5.5 Spacing, radius, elevation
```
# Spacing — 4px base unit
--space-0 0  --space-1 4  --space-2 8  --space-3 12  --space-4 16
--space-5 20 --space-6 24 --space-8 32 --space-10 40 --space-12 48 --space-16 64

# Radius
--radius-none 0  --radius-sm 4  --radius-md 8  --radius-lg 12  --radius-full 9999
(default control radius = md; cards = lg; pills/badges = full)

# Elevation (calm, low-spread — industrial, not floaty)
--elevation-sm  0 1px 2px rgba(16,29,52,.06)
--elevation-md  0 2px 8px rgba(16,29,52,.08)
--elevation-lg  0 8px 24px rgba(16,29,52,.12)   # modals, popovers
--elevation-none none   # default for in-table elements
```

### A5.6 Density tokens (the three-context mechanism)
The same components read these; switching density re-themes the whole app.
```
                     Comfortable   Compact      Touch (shop-floor)
--density-row-h        40px         32px         64px
--density-control-h    36px         30px         56px
--density-font         14px         13px         18px
--density-pad-x        16px         12px         20px
--density-tap-min      36px         32px         56px   # min hit target
--density-icon         18px         16px         28px
```
- **Comfortable** = office default. **Compact** = power-user toggle for big tables. **Touch** = auto-applied on M4 floor/kiosk routes and detected coarse-pointer devices.
- Touch mode also: removes hover-only affordances, enlarges status tiles, hides secondary columns, raises confirm thresholds.

### A5.7 Breakpoints, z-index, motion
```
--bp-sm 360  --bp-md 768  --bp-lg 1024  --bp-xl 1440        (mobile-first)
--z-base 0 --z-sticky 100 --z-drawer 200 --z-overlay 300 --z-modal 400 --z-toast 500 --z-command 600
--motion-fast 150ms --motion-base 200ms --motion-slow 300ms
--ease-standard cubic-bezier(.2,0,0,1)   --ease-emphasized cubic-bezier(.2,0,0,1)
(honor prefers-reduced-motion → durations collapse to 0/opacity-only)
```

## A6. Global Component Inventory

### Atoms
| Component | Variants | States |
|---|---|---|
| Button | primary, secondary, ghost, destructive, icon-only | default, hover, active, focus, disabled, **loading** |
| Input | text, number(tabular), password, search | default, focus, error, disabled, read-only |
| Select / Combobox | single, multi, async-search | + open, loading-options, no-results |
| Checkbox / Radio / Toggle | — | on, off, indeterminate, disabled, focus |
| Badge / Status pill | semantic, production-status, count | (color+icon+label, never color-only) |
| Money / Qty cell | — | tabular, right-aligned, unit/currency suffix, negative=danger |
| Avatar | image, initials | sm/md/lg |
| Icon | line set (24px grid) | — |
| Tooltip | — | top/right/bottom/left |
| Skeleton | line, block, table-row | shimmer |

### Molecules
| Component | Contains | Usage |
|---|---|---|
| Form field | label + control + help + error + required-mark | all forms |
| Search/filter bar | search + filter chips + sort + density toggle + view toggle | every list |
| Stat card | label + big number + delta + sparkline | dashboards, headers |
| Status timeline step | icon + label + time + actor | M4 steps, audit, doc history |
| Toast | icon + message + action + dismiss | feedback |
| Confirm dialog | title + consequence text + (reason field) + (re-auth) + actions | guarded actions |
| Drawer (side panel) | header + scroll body + sticky footer | quick-create, detail peek, filters |
| Document line-item row | item lookup + qty + unit price + total | M5 quote/invoice editor |
| Scan field | persistent input + camera trigger + last-scan echo | M3/M4 |

### Organisms
| Component | Contains | Notes |
|---|---|---|
| App shell | sidebar + top bar + content + toast region | role-filtered nav; density-aware |
| Data table | sticky header + sortable cols + row actions + bulk bar + pagination + density | the workhorse — column presets per module, saved views |
| Command palette | search + grouped actions/records (⌘K) | office power-users |
| Detail layout | breadcrumb + title + status + action cluster + tabs + side metadata | every record |
| Posting wizard | stepper + per-step validation + review + post | goods receipt, payroll run, stock count |
| Dashboard grid | filter bar + stat row + chart panels (cross-filtering) | M6 |
| Notification center | grouped, actionable alerts | low-stock, delays, approvals, overdue |

## A7. Global Interaction & State Patterns

### Permission-aware UI (cross-cutting)
- Modules absent from nav if unpermitted; in-context actions a user *could* expect but lacks → shown disabled with a tooltip ("Requires sales.document.void").
- **Field-level gating:** salary/cost figures render as `••••` with a lock icon for users without `hr.salary.view` / `inventory.cost.view` — the field exists but is masked (not removed, so layout is stable and the user understands access is the issue).
- **Re-auth & reason:** force-logout, role delete, document void, stock adjustment, payroll approve open a Confirm dialog that captures a **reason** (where the backend requires it) and a **Super-Admin password** (where specified). The dialog states the exact consequence and the affected record id.

### Loading
Skeletons over spinners. Full-page skeleton on first load; route shell persists on navigation; tables show skeleton rows; async exports/PDF/payroll return immediately with a **job toast** ("Generating… we'll notify you") tracked in the notification center.

### Forms
On-blur per-field validation + on-submit summary; errors inline beneath the field, plus a top summary for long forms; submit button shows loading then success; unsaved-changes guard on navigation for editors; sectioned forms with a **sticky footer** (Cancel · Save draft · Submit/Post).

### Feedback
| Action | Feedback |
|---|---|
| Create/update | Inline "Saved" or toast (3–4s) |
| Post/issue (stock, invoice) | Toast + status flip animates in place |
| Destructive (void/delete) | Confirm dialog → toast; affected row updates/strikes |
| Async job (PDF, payroll, export) | Job toast → notification on completion w/ download |
| Realtime (timeline, dashboard) | Soft in-animation; subtle "updated" pulse |
| Error | Inline + toast for global; persists until resolved; never a dead-end (always a next action) |

### Empty / error / offline states
Every list defines an **empty state** (illustration-light, one-line explanation, primary CTA — e.g. "No work orders yet → Create work order"). Error states give a cause + Retry. **Shop-floor offline (Q6):** if enabled, scan screen shows an offline banner, queues scans locally, and shows a sync badge — operators keep working.

### Keyboard (office power-users)
`⌘K` palette · `c` create primary entity in current module · `/` focus search · `g then i/p/s` go-to module · `Esc` close · `⌘Enter` submit/post · arrow + space for table row select.

## A8. Accessibility & Responsive Baseline
- **Target WCAG 2.1 AA.** Contrast ≥ 4.5:1 text / 3:1 large & UI; status never color-only (icon+label enforced by the Badge component); visible focus rings on all focusables; ARIA labels on icon-only buttons; live-regions announce realtime/job updates; min tap target per density token (≥44px office, 56px touch).
- **Responsive:** mobile-first. Desktop = sidebar + multi-column; tablet = collapsible sidebar, content fills, touch density on floor routes; mobile = bottom tab bar + drawer, single column, tables become stacked cards, primary action as FAB. Document editor (M5) and timeline (M4) degrade to read-first on mobile with a clear "edit on larger screen" affordance for complex authoring.

---

# PART B — Module UX Specifications

Each module follows the same shape: **Users & top tasks → Screen inventory → Key flows → Screen layouts (wireframes) → Module components → States → Acceptance.**

---

## M1 — Access & Identity (IAM)

### Users & top tasks
Primary: Super Admin / IT. Calm, expert, infrequent-but-high-stakes.

| Priority | Task | Frequency | Complexity |
|---|---|---|---|
| P0 | Create/clone a role & set its permission matrix | Occasional | High |
| P0 | Assign roles to a user; force-logout | Weekly | Med |
| P1 | Review audit log (who changed what) | Weekly | Med |
| P2 | Import permissions from Excel | Rare | Med |

### Screen inventory
- **Users** — list, detail (roles, sessions, activity), create/edit drawer
- **Roles** — list, role editor (permission matrix), clone flow, delete (guarded)
- **Role templates** — list + editor
- **Audit log** — filterable timeline/table
- **Import** — upload + validation review

### Key flow — Edit role permissions (P0)
```
Trigger: Roles list → click role → Permission Matrix tab
1. Matrix screen → user toggles cells (module × action grid)
2. Dirty state → sticky footer "Save changes (affects N users)" appears
3. Save → confirm dialog states "N active users will be force re-authenticated"
4. Confirm → toast "Role updated"; affected users' permissions_version bumped (their next request → re-login)
Alt: Clone → name dialog → opens new role pre-filled, editable
Error: removing the last permission of a system role → blocked inline ("system roles need ≥1 permission")
```

### Key flow — Delete role (guarded, P0)
```
Roles list → row menu → Delete → if users bound: 409 surfaced as inline
  "12 users still use this role — reassign them first" + link to filtered user list (blocks).
If unbound → Confirm dialog with Super-Admin PASSWORD field + consequence text → success toast.
```

### Screen: Role Editor
**Layout pattern:** Detail + tabs. **Touch:** N/A (admin = desktop).
```
┌──────────────────────────────────────────────────────────┐
│ ‹ Roles  /  Warehouse Staff            [Clone] [Delete ⚠] │
│ Status: 14 users · cloned from "Staff base"               │
│ ── Tabs: Permissions | Users (14) | Activity ──────────── │
├──────────────────────────────────────────────────────────┤
│ PERMISSION MATRIX                          [search perms] │
│            View  Create  Edit  Delete  Approve  Export     │
│ Inventory   ☑     ☑      ☑      ☐       ☐        ☑         │
│ Production  ☑     ☑      ☑      ☐       ☐        ☐         │
│ Sales       ☑     ☐      ☐      ☐       ☐        ☑         │
│ HR (salary) ☐←masked group                                │
│ …                                                          │
├──────────────────────────────────────────────────────────┤
│ Sticky footer:        Discard        Save (affects 14) ▸  │
└──────────────────────────────────────────────────────────┘
```
- Matrix = the signature M1 component: rows = module.resource, cols = actions, cells = checkboxes; group headers collapse; special perms (e.g. `hr.salary.view`) shown as distinct toggles below the grid with an explanatory caption.
- "Affects N users" count is live — error prevention: the admin sees blast radius *before* saving.

### Screen: Audit Log
List/table with a strong filter bar (actor, entity type, action, date range). Each row expands to a **before/after diff** (two-column, changed fields highlighted). Read-only, never editable — visually communicated by a "sunken" surface and no row actions.

### Module components
Permission matrix grid · session list (with "revoke" per session) · before/after diff viewer · Excel import validation table (rows with per-row OK/error).

### States
- Empty roles → "No custom roles yet · Create from template".
- Import partial → table shows valid rows (green) + invalid (red, with reason); CTA "Import 48 valid rows" / "Fix & re-upload".
- Force-logout success → user detail shows all sessions struck through.

### Acceptance (UX)
- Saving a permission change always surfaces the affected-user count before commit.
- Salary/cost permission group is visually separated and captioned (prevents accidental over-grant).
- Deleting a bound role is impossible from the UI without first reassigning (no dead-end).
- Audit rows are visibly non-interactive; diffs are scannable at a glance.

---

## M2 — HR & Payroll

### Users & top tasks
HR officer (desktop) + Owner (mobile approvals).

| Priority | Task | Frequency | Complexity |
|---|---|---|---|
| P0 | Run & approve monthly payroll | Monthly | High |
| P0 | Approve OT / cash advance | Weekly | Low (but mobile) |
| P1 | Manage employee record & documents | Weekly | Med |
| P2 | Export PND.1 / SSO | Monthly | Low |

### Screen inventory
- **Employees** — list, detail (profile · documents · salary history · pay components · reporting line), create/edit
- **OT requests** — approval queue + detail
- **Cash advances** — approval queue + detail (Super-Admin approve)
- **Attendance** — import + monthly grid
- **Payroll** — run list, **run workspace (wizard)**, payslip detail
- **Tax exports** — PND.1 / SSO

### Key flow — Monthly payroll (P0, the marquee flow)
```
Trigger: Payroll → New run (period)
1. Wizard step 1 "Inputs": shows employees in scope, flags missing data (no salary, unreconciled OT) → must resolve or exclude
2. Step 2 "Calculate": [Calculate] → async job toast → returns payslip preview table
   (cols: employee · base · OT · allowances · deductions · SSO · tax · advance · NET)
3. Step 3 "Review": sortable, searchable; click a row → payslip breakdown drawer (read-only math)
   Outliers auto-flagged (net ≤ 0, net > 2× base) with a warning chip
4. Step 4 "Approve": [Approve run] → Confirm dialog (consequence: "locks the run, pulls outstanding advances, generates payslips") + perm hr.payroll.approve
5. Success → status APPROVED; e-payslip PDFs generate async → notification when ready
```
- The breakdown drawer must show the **net-pay formula** transparently, line by line (trust = seeing the math).
- Money columns: tabular, right-aligned, NET column emphasized (bolder, brand color); negative deductions shown in danger color with parentheses.

### Key flow — Approve cash advance (mobile, P0)
```
Owner gets notification → opens approval card: employee · amount · reason · ceiling-check badge (✓ within 50% / ⚠ over)
[Approve] (re-auth as Super Admin) / [Reject] (reason) → toast → HR notified.
Designed as a single thumb-reachable card; no table needed on mobile.
```

### Screen: Payroll Run Workspace (wizard)
```
┌────────────────────────────────────────────────────────────┐
│ ‹ Payroll / Run 2026-03           Status: CALCULATED        │
│ ● Inputs ─ ● Calculate ─ ● Review ─ ○ Approve   (stepper)   │
├────────────────────────────────────────────────────────────┤
│ [search emp] [filter: flagged]      density: Compact ▣      │
│ Employee     Base    OT    Allow  Deduct  SSO  Tax   NET  ⚠ │
│ EXT0001  18,000  1,200   500   −2,000 −750 −430 16,520     │
│ EXT0002  15,000      0     0   −5,000 −750 −210  9,040  ⚠  │  ← advance-heavy, flagged
│ …                                                          │
├────────────────────────────────────────────────────────────┤
│              Recalculate            Approve run (locks) ▸   │
└────────────────────────────────────────────────────────────┘
```

### Screen: Employee Detail
Detail + tabs (Profile · Documents · Salary · Pay components · Reporting). Salary tab and any pay figures are **field-gated** (masked `••••` + lock for users without `hr.salary.view`). Documents tab = secure file list (signed-URL download, no inline render of ID cards). Probation-ending shows a warning banner with the date.

### Module components
Payslip breakdown drawer (formula-transparent) · approval card (mobile-first) · attendance month-grid · ceiling-check badge · PII-masked field · document vault row.

### States
- Payroll inputs blocked → "3 employees missing salary" gate with fix links.
- Empty OT queue → "No pending OT".
- Payslip generating → row shows "PDF pending" until job done.

### Acceptance (UX)
- The payslip drawer shows every term of the net-pay formula; nothing is a black box.
- Outlier nets are flagged before approval (error prevention).
- Salary fields are masked, not removed, for unauthorized users (stable layout, clear reason).
- Cash-advance approval is completable one-handed on mobile with re-auth.

---

## M3 — Inventory & Costing

### Users & top tasks
Warehouse staff (desktop + handheld scanner). Scan-heavy, moderate literacy.

| Priority | Task | Frequency | Complexity |
|---|---|---|---|
| P0 | Receive goods (with lots/barcodes/landed cost) | Daily | Med |
| P0 | Issue materials to production | Daily | Low |
| P1 | Stock count & adjustment | Weekly/Monthly | Med |
| P1 | Read stock card / valuation / low-stock | Daily | Low |
| P2 | Manage items / SKUs / BOM | Weekly | Med |

### Screen inventory
- **Items** — list (filter by type), detail (SKUs · lots · stock card · BOM), create/edit
- **Goods receipt** — list, **receipt wizard** (lines → landed cost → confirm → post)
- **Goods issue** — list, issue form (scan-driven)
- **Stock count** — session list, count grid, reconcile → adjustment
- **Stock adjustment** — list, create (reason-required), approve
- **Barcode printing** — selection → label job
- **Reports** — stock card, valuation, low/dead stock

### Key flow — Goods receipt (P0)
```
Trigger: Goods receipt → New
1. Header: supplier, then add lines (scan item barcode OR search) → qty (in receiving UOM e.g. "roll") + unit price
   Each scanned line echoes: item name, running line total
2. Landed cost step: enter freight/import total + allocation method (value/weight/qty) → preview shows per-line cost impact
3. Confirm: review allocated unit costs → [Confirm]
4. Post: [Post to stock] → creates lots, writes ledger IN, prints lot-barcode labels (job) → toast
Edge: UOM mismatch handled silently (system converts to base unit, shows both: "1 roll = 50 m")
```

### Key flow — Issue materials (P0, scan-first)
```
Goods issue → New → purpose=Production, link Work Order (optional)
Scan loop: persistent scan field → scan item/lot → qty → repeat. Last 5 scans listed with undo.
[Post] → ledger OUT (FIFO consumes oldest lots / MAV at avg) → 422 if insufficient (clear "only 12m left").
Optimized for a handheld: big scan field, large qty stepper, minimal chrome (Touch density auto-on).
```

### Screen: Item Detail
```
┌──────────────────────────────────────────────────────────┐
│ ‹ Items / Sublimation Ink — Cyan      [AA00012] [Edit]    │
│ Type: RAW · Base UOM: ml · Costing: MAV                   │
│ On hand: 4,250 ml   Avg cost: ฿0.85/ml   ⚠ near min (5,000)│ ← cost masked w/o perm
│ ── Tabs: Overview | SKUs | Lots | Stock Card | BOM ────── │
├──────────────────────────────────────────────────────────┤
│ STOCK CARD                         [from][to] [export ▾]  │
│ Date     Ref           In     Out   Balance  Unit cost    │
│ 03-01  GR-2026-018  +5,000        5,000   ฿0.84           │
│ 03-04  ISS-…              −750    4,250                   │
│ …  (ledger view — append-only, visually immutable)        │
└──────────────────────────────────────────────────────────┘
```
- Stock card reads like a bank statement — running balance, immutable rows; the trust object of M3.
- **Cost/valuation figures field-gated** by `inventory.cost.view`.

### Screen: Items List
CRUD table with type filter chips (Raw/Finished/Consumable), barcode column, on-hand with **low-stock warning chip**, saved column presets. Bulk actions: print barcodes, export. Inline quick-look drawer on row click before full navigation.

### Module components
Scan field (persistent, with last-scans + undo) · landed-cost allocator (live per-line preview) · stock-card ledger table · lot chip · UOM dual-display ("1 roll = 50 m") · low/dead-stock health chip · BOM tree editor (expand/collapse, roll-up cost preview).

### States
- Insufficient stock on issue → inline 422 with exact remaining qty + suggestion.
- Count in progress → items "locked for counting" badge; movement disabled with explanation.
- Empty BOM → "No BOM defined · Add components" (blocks backflush — warned).
- Adjustment without reason → submit blocked, reason field error.

### Acceptance (UX)
- Issue/receive screens are fully operable by scanning on a handheld in Touch density (targets ≥56px, minimal typing).
- Stock card visibly reads as immutable; corrections appear as new compensating rows, never edits.
- Landed-cost allocation previews per-line cost impact before posting.
- Cost figures masked for unauthorized users; on-hand still visible.

---

## M4 — Production Tracking

### Users & top tasks
**Two distinct user/device profiles** — Production lead (desktop, planning) and Floor operator (tablet, Touch density, gloves). This module most needs the dual-mode design.

| Priority | Task | User | Frequency | Complexity |
|---|---|---|---|---|
| P0 | Scan start/finish a step | Operator (tablet) | Continuous | Low |
| P0 | Watch timeline, spot delays/bottlenecks | Lead (desktop) | Continuous | Med |
| P1 | Create work order from routing | Lead | Daily | Med |
| P1 | Flag defect / send subcontract | Operator/Lead | Daily | Low |

### Screen inventory
- **Timeline / Gantt** — the production command center (desktop)
- **Work orders** — list, detail (steps · mockup · defects · history), create wizard
- **Scan station (kiosk)** — operator full-screen scan UI (tablet, Touch)
- **WIP / bottleneck board** — by-department backlog
- **Subcontract** — outstanding SLA tracker

### Key flow — Operator scan (P0, kiosk/Touch)
```
Tablet at a station, locked to Scan Station route → Touch density.
1. Big scan field (auto-focused) → operator scans the routing-card barcode
2. Screen shows the work order card: customer, item, qty, THIS step name, mockup thumbnail
3. Two giant buttons: [▶ START]  /  [■ FINISH]  (state-appropriate; only the valid one enabled)
4. Tap → confirmation flash + timer state; auto-returns to scan field for next card
Defect path: [⚑ Report defect] → type chooser (large tiles: Misprint/Bad stitch/…) + qty stepper → submit
Offline (Q6): banner + queued badge; scans stored locally, sync on reconnect.
```
- **No free-text, no menus, no nav** in kiosk mode — a frame around two actions. Color-status fills the card edge so a passing supervisor reads state across the room.

### Key flow — Lead watches timeline & resolves delay (P0, desktop)
```
Timeline (Gantt) → rows = work orders, bars = steps color-coded by status.
Delayed step pulses red + appears in an alert rail. Lead clicks step → drawer:
  assigned worker, machine, elapsed vs standard, defects → actions: reassign, hold, subcontract, message.
Realtime: scans on the floor update bars live (soft animation). Bottleneck board shows which department is piling up.
```

### Screen: Production Timeline (command center)
**Layout pattern:** Board/Timeline. Desktop-first; mobile = read-only list.
```
┌─────────────────────────────────────────────────────────────┐
│ Production Timeline      [Today ▾][filter: Delayed] [+ WO]   │
│ ⚠ Alerts (2): WO-114 Sew delayed 25m · WO-097 SLA overdue    │
├──────────┬──────────────────────────────────────────────────┤
│ WO-112   │ ●Layout ●Print ◐HeatPress ○Cut ○Sew ○QC          │  ← status dots per step
│ ACME 200 │ ▓▓▓▓▓▓▓▓░░░░░░░  due Fri                         │  ← gantt bar
│ WO-114   │ ●●●●● ▲Sew(delayed) ……                            │
│ TENGCO   │ ▓▓▓▓▓▓▓▓▓▓▓██  ← red segment                     │
│ …        │                                                  │
├──────────┴──────────────────────────────────────────────────┤
│ Legend: ○Pending ◐InProgress ●Completed ▲Delayed ❙❙Hold ↗Sub │
└─────────────────────────────────────────────────────────────┘
```
- Status uses the production-status token set (A5.3) — color + dot-shape + label, legible without color.
- Click bar → step drawer; click WO → full detail (mockup viewer, defect log, step history timeline).

### Screen: Scan Station (kiosk)
```
┌───────────────────────────────────┐   (Touch density, full-screen, no nav)
│   [ 📷  Scan routing card …      ] │   ← persistent, auto-focus, 56px+
│                                   │
│  WO-114 · TENGCO · Jersey ×200    │
│  Step:  S E W                     │
│  [mockup thumb]   elapsed 00:42   │
│ ┌─────────────┐ ┌───────────────┐ │
│ │   ▶ START   │ │   ■ FINISH    │ │   ← only valid one enabled, huge
│ └─────────────┘ └───────────────┘ │
│         [ ⚑ Report defect ]        │
│  ─ status edge color = step state ─│
└───────────────────────────────────┘
```

### Module components
Gantt/timeline row (interactive bars) · production-status dot (shape+color+label) · scan-station kiosk card · giant action button (Touch) · defect tile picker · mockup viewer · alert rail · WIP/bottleneck column · subcontract SLA countdown chip.

### States
- Empty timeline → "No active work orders".
- Step running → live elapsed timer; crosses standard → flips to Delayed (animated) + alert.
- Offline kiosk → banner + queued-scan count.
- Subcontract overdue → red SLA chip + alert.

### Acceptance (UX)
- Step status is identifiable without relying on color (shape + label) and readable across a room.
- Kiosk mode exposes exactly two primary actions, scannable and tappable with gloves (Touch targets).
- A floor scan updates the lead's timeline within seconds, visibly.
- Delayed steps surface in the alert rail, not just as a color change.

---

## M5 — Sales Documents

### Users & top tasks
Sales staff + Accountant (desktop, precision). Document fidelity + tax correctness are paramount.

| Priority | Task | Frequency | Complexity |
|---|---|---|---|
| P0 | Create quotation → convert → invoice | Daily | Med |
| P0 | Record payment → issue receipt/tax invoice | Daily | Med |
| P1 | Track aging / overdue | Daily | Low |
| P1 | Customize document template; export PDF | Weekly | Med |
| P2 | Submit e-Tax | Per doc | Low |

### Screen inventory
- **Documents worklist** — unified list (quotations/invoices/receipts) with status + aging
- **Document editor** — split: line-item editor ⟷ live paper preview
- **Customer** — list, detail (docs, aging), quick-create
- **Payments** — record payment, receipt issuance
- **Templates** — template editor (logo/signature/stamp, Excel named-range map)
- **Aging dashboard** — AR by bucket

### Key flow — Quote → Invoice → Receipt (P0)
```
1. New quotation: pick customer (autocomplete fills tax-id/branch/address) → set VAT mode (VAT/Non-VAT) + calc (inclusive/exclusive) → add lines
   LIVE PREVIEW (right pane) renders the actual document as you type; totals/VAT/WHT compute live
2. Send → Approve (status chips track state) 
3. [Convert to invoice] — one click → invoice pre-filled identically; quotation → CONVERTED
4. Issue invoice → set credit terms (15/30/45) → due date auto; PromptPay QR embeds amount
5. Record payment → choose full/partial; on full → issues Receipt/Tax Invoice; status → PAID
   Partial → PARTIALLY_PAID, remaining tracked
Guard: Void (perm + reason); blocked if receipt already issued (clear message).
```

### Screen: Document Editor (signature screen of M5)
**Layout pattern:** Split view — editor left, paper preview right. The preview *is* the spec for the PDF (WYSIWYG).
```
┌───────────────────────────┬────────────────────────────────┐
│ EDITOR                     │  PAPER PREVIEW (live)           │
│ Customer: [ACME Co ▾]      │  ┌──────────────────────────┐  │
│  tax 0105.. · HQ · Bangkok │  │ [logo]   ใบเสนอราคา       │  │
│ VAT: (•)VAT ( )Non-VAT     │  │          Quotation        │  │
│ Calc: ( )Incl (•)Excl      │  │ No. QV20260042  Date …    │  │
│ ── Lines ──────────────    │  │ Bill to: ACME Co …        │  │
│ # Item     Qty  Price  Tot │  │ ┌────┬─────┬────┬───────┐ │  │
│ 1 Jersey   200  250  50,000│  │ │ #  │Desc │Qty │ Amount│ │  │
│ [+ add line / scan]        │  │ …                         │  │
│                            │  │ Subtotal      50,000      │  │
│ Subtotal   50,000          │  │ VAT 7%         3,500      │  │
│ VAT 7%      3,500          │  │ Grand total   53,500      │  │
│ WHT 3%     (1,500)         │  │ [PromptPay QR]  signature │  │
│ Grand      53,500          │  └──────────────────────────┘  │
│ Net to receive 52,000      │  paper surface (--color-bg-paper)│
├───────────────────────────┴────────────────────────────────┤
│ Sticky footer:  Save draft   Send ▸   [Convert to invoice]  │
└─────────────────────────────────────────────────────────────┘
```
- **VAT inclusive/exclusive** toggle visibly changes how totals break out in the preview (teaches the user the difference; prevents the classic tax error).
- WHT shown as a deduction with **"net to receive"** highlighted — matches what the customer actually transfers.
- Money: tabular, right-aligned, two decimals; document numbers in mono.

### Screen: Documents Worklist
CRUD table; status chips (Draft/Sent/Approved/Issued/Partial/Paid/Overdue/Void — semantic tokens, void=struck+muted); **aging column** color-coded; filters by type/status/customer/date; bulk export. Overdue rows surface a subtle danger tint + an "send reminder" row action.

### Module components
Document line-item editor · live paper-preview surface · VAT mode/calc toggle (preview-linked) · WHT/net-to-receive panel · PromptPay QR block · status chip (doc lifecycle) · aging bucket chip · template designer (asset slots + named-range mapper) · customer autocomplete (fills tax fields).

### States
- Empty worklist → "No documents · Create quotation".
- Quotation expired → EXPIRED chip + "duplicate to renew" action.
- Convert blocked (not approved) → disabled with tooltip.
- Void blocked (receipt exists) → explanatory dialog, not a silent fail.
- Async export/e-Tax → job toast → notification with file.

### Acceptance (UX)
- The live preview matches the exported PDF 1:1 (WYSIWYG); no surprises on export.
- Switching VAT inclusive/exclusive visibly and correctly re-breaks totals in the preview.
- "Net to receive" (after WHT) is always shown for withholding cases.
- Document status lifecycle is legible at a glance in the worklist; void never deletes.
- Numbering and tax fields are never free-typed where the system can fill them (error prevention).

---

## M6 — Reporting & Analytics

### Users & top tasks
Owner/GM (mobile glance) + Accountant/leads (desktop deep-dive). Read-only.

| Priority | Task | Frequency | Complexity |
|---|---|---|---|
| P0 | Glance at profit/stock/sales health | Daily | Low |
| P1 | Cross-filter & drill a dashboard | Weekly | Med |
| P1 | Export report / schedule email digest | Weekly | Low |

### Screen inventory
- **Overview dashboard** — role-based landing (KPI row + key charts)
- **Domain dashboards** — Inventory · Sales · Cost · Profit · Tax
- **Report viewer** — tabular report + export
- **Schedules** — manage automated email digests

### Key flow — Cross-filter a dashboard (P1)
```
Dashboard → KPI row + panels. Click a dimension anywhere (e.g. a month bar, a product slice)
→ ALL panels re-filter to that selection (cross-filtering); an active-filter chip rail shows what's applied
→ click a data point → drill to the underlying report rows → [export ▾ PDF/Excel/CSV] (async job)
Clear filters resets. Filter state is shareable via URL.
```

### Key flow — Schedule a digest (P1)
```
Reports → Schedules → New → pick report + recipients + cadence (cron-friendly UI: "Every Monday 08:00")
+ format → Save. [Run now] to preview-send. Failures show in notification center with retry.
```

### Screen: Overview Dashboard
**Layout pattern:** Dashboard grid. Mobile = stacked single-column, KPI cards first.
```
┌─────────────────────────────────────────────────────────────┐
│ Good morning · 27 Jun 2026          [period ▾] [export ▾]    │
│ ┌─Sales MTD─┐ ┌─Gross margin─┐ ┌─Stock value─┐ ┌─Overdue AR─┐│
│ │ ฿2.4M ▲12%│ │   31.5% ▲2pt │ │   ฿1.8M     │ │ ฿340K  3 ⚠ ││  ← KPI cards w/ delta + sparkline
│ └───────────┘ └──────────────┘ └─────────────┘ └────────────┘│
│ ┌─Sales trend (2/3 width)──────────┐ ┌─Alerts (1/3)────────┐ │
│ │  [line/bar chart, cross-filter]  │ │ • 4 low-stock items │ │
│ │                                  │ │ • 2 delayed WOs     │ │
│ └──────────────────────────────────┘ │ • 3 invoices overdue│ │
│ ┌─Top products────────┐ ┌─Production status──────────────────┐│
│ │ [bar, click→filter] │ │ [pipeline funnel by stage]         ││
│ └─────────────────────┘ └────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```
- KPI cards: big tabular number + delta (colored, with ▲/▼ — not color-only) + sparkline. Cost/profit KPIs gated by `inventory.cost.view`.
- Charts are interactive (cross-filter); an **active-filter chip rail** sits above panels so the user always knows the current slice (visibility of system status).
- **Alerts panel** unifies low-stock (M3), delays (M4), overdue (M5) — the owner's single glance.

### Module components
KPI/stat card (number + delta + sparkline) · interactive chart panel (cross-filter aware) · active-filter chip rail · alerts panel · report data table (export-ready) · schedule editor (cron-friendly) · export menu (PDF/Excel/CSV, async).

### States
- No data yet → friendly empty dashboard with "data appears as you operate".
- Loading → KPI skeletons then progressive panel fill (don't block whole page).
- Cost panels for unauthorized user → masked with lock + "requires cost access".
- Export running → job toast → notification with download.

### Acceptance (UX)
- Selecting any dimension cross-filters every panel consistently; the active slice is always shown.
- Valuation/KPIs reconcile visibly with underlying reports on drill-down.
- Owner's overview surfaces all three alert classes (stock/production/finance) in one place.
- Cost/profit data respects permission gating.

---

# PART C — Implementation Notes & Build Order

### Recommended UI foundation
- **React + TypeScript**, headless primitives via **Radix UI**, styled with **Tailwind** mapped to the A5 tokens (tokens → CSS custom properties → Tailwind theme), component layer akin to **shadcn/ui** (owned, themeable). Tables via **TanStack Table** (the workhorse organism). Charts via a composable lib (Recharts/visx) themed from tokens. This matches the React + component-lib + PWA stack decision.
- Implement **density** as a `data-density` attribute on the app shell reading the A5.6 tokens; **Touch** auto-applied on M4 kiosk routes + coarse-pointer detection.
- Implement **permission-aware rendering** and **field masking** as shared HOCs/hooks so every module inherits A7 behavior identically.

### Token handoff
Part A5 is the source of truth for tokens. Pipe it through Style Dictionary (or equivalent) to emit CSS vars + Tailwind config + (optionally) Figma variables. Lock the **semantic** layer (A5.2/A5.3) first — components must only consume semantic names, never primitives.

### Build order (P0-first, foundation-first)
1. **Design system & shell** — tokens, app shell (sidebar/topbar/command palette), Data Table, Form field, Confirm dialog, Status/Money primitives, toast + notification center. *(Everything else composes from these.)*
2. **M1 IAM** — needed to gate everything; role matrix + audit.
3. **M3 Inventory** — receive/issue scan flows + item detail/stock card (Touch density proven here).
4. **M5 Sales** — document editor + live preview + worklist (highest daily business value with M3).
5. **M4 Production** — timeline + scan kiosk (dual-mode; reuses status tokens + scan field).
6. **M2 HR & Payroll** — payroll wizard + mobile approvals.
7. **M6 Reporting** — dashboards + cross-filtering (consumes data the others now produce).

### First screen to build
The **Data Table organism in the app shell**, then the **M3 Item Detail / Stock Card** — it exercises tokens, density, money/cost masking, and the immutable-ledger pattern that recurs across the system.

### Chaining to frontend-design
> Implement the **app shell + Data Table + token layer** per Part A (A5 tokens, A6 inventory, A7 patterns) in React + Radix + Tailwind. Then build **M3 Item Detail & Goods Receipt** per Part B (M3 layouts, components, states, acceptance). Honor density tokens and permission-aware field masking throughout.

---

*End of UX/UI Specification (M1–M6) · v1.0. Part A = direction + tokens (lock first). Part B = per-module screens/flows/components/states. Part C = build order. Pair with the Backend Spec for data contracts and the ERP Spec for business rules.*
