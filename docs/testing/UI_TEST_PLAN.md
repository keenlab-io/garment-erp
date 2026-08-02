# UI Test Plan — Garment-ERP

Master strategy for browser-level UI testing of `apps/web` (the running app) and `@erp/ui`
(Storybook). The shared, tool-agnostic **test-case catalog** lives in
[`docs/testing/test-cases/`](test-cases/); this document defines scope, environment, personas,
tooling, the coverage matrix, and reporting.

## Quickstart

```bash
# 1. Infra (Postgres :5432, Redis :6379, MinIO :9000)
docker compose -f infra/docker-compose.yml up -d

# 2. Migrate + seed (creates the superadmin login)
pnpm db:migrate && pnpm db:seed

# 3. App (web :5173 → api :3000 proxied, realtime via /socket.io)
pnpm dev

# 4. Storybook, when running component (TC-CMP) cases
pnpm --filter @erp/ui storybook        # :6006

# 5a. Playwright (deterministic regression)
cd e2e && npx playwright test          # see e2e/README.md

# 5b. Claude for Chrome (interactive/exploratory)
# follow docs/testing/claude-chrome-runbook.md, feed it one test-cases/*.md file
```

Login: `superadmin` / `changeme` (or `SEED_SUPERADMIN_PASSWORD`). Limited personas are **real
logged-in users** you create first via the Admin UI — see [Personas](#4-personas).

---

## 1. Purpose & scope

The frontend has 7 top-level modules, ~40 screens, ~50 feature components, and ~25 `@erp/ui`
primitives/organisms, plus cross-cutting behaviors (permission gating + super-admin bypass,
theme/density/locale, command palette, kiosk/lockdown, login/re-auth, session restore). Existing
automated coverage is Vitest + RTL unit/component tests and Testcontainers API integration specs —
**nothing exercises the app through a real browser**. This plan closes that gap with a repeatable
way to validate every module and component through the UI as the app evolves.

**Objectives**

1. Every module and screen in the nav registry has at least a smoke check — no route can silently
   break or silently disappear from coverage.
2. Each module's primary workflow (its "golden path") is exercised end-to-end against the real
   backend with seeded data.
3. Permission gating is verified from the user's side: what a limited persona sees, and — equally —
   what is **absent** from nav, command palette, and route.
4. High-risk flows (money, payroll, void/approve, kiosk scanning, re-auth) get deep cases.
5. `@erp/ui` component behaviors are verified in isolation via Storybook, decoupled from backend state.
6. One catalog serves three executors: a human, Claude for Chrome, and Playwright.

**Out of scope**: API-only behavior (covered by integration specs), unit-level logic (Vitest),
visual pixel-diffing (may be added later on top of the Playwright screenshots), load/perf testing.

## 2. Two target surfaces

| Surface | URL | What it tests | Use when |
|---|---|---|---|
| **Running app** | `http://localhost:5173` | Screens, routing, guards, real API + seeded data, realtime (`/socket.io`), session/auth, kiosk chrome | Module smoke/golden-path/permission/high-risk cases (TC-XC, TC-INV, TC-PROD, TC-SALES, TC-HR, TC-RPT, TC-ADMIN) |
| **Storybook** | `http://localhost:6006` | Isolated `@erp/ui` primitives/organisms with controlled props — no backend, no auth | Component behavior cases (TC-CMP): DataTable sorting/pagination/keyboard nav, InkChip states, ConfirmDialog re-auth flow, Wizard gating, ScanField dedupe, etc. |

Rule of thumb: if the assertion depends on **data, permissions, or navigation**, test the app; if it
depends only on **component props/interaction**, test the story. Component bugs found via app cases
should get a reproducing TC-CMP case so the fix is verifiable without the full stack. Story ids come
from each component's `.stories.tsx` (Storybook title → kebab-case id); expected behaviors are
documented in its `.test.tsx`.

## 3. Environment bring-up

1. `docker compose -f infra/docker-compose.yml up -d` — Postgres `:5432`, Redis `:6379`, MinIO `:9000`.
2. `pnpm db:migrate && pnpm db:seed` — schema + seed data, including the super-admin user
   (`superadmin` / `changeme`, overridable via `SEED_SUPERADMIN_PASSWORD`).
3. `pnpm dev` — api on `:3000`, web on `:5173` with `/api` proxied to the api; realtime traffic
   flows over `/socket.io` (production timeline / work-order live updates depend on it).
4. For TC-CMP cases: `pnpm --filter @erp/ui storybook` on `:6006`.

Reset between destructive runs: re-seed (`pnpm db:seed`) or recreate the compose volumes. Cases that
mutate seeded data state that in **Preconditions**.

Session mechanics relevant to tests: the access token is in-memory; the refresh token persists in
localStorage under `erp.refresh_token`; `restoreSession()` runs before first render, so a reload must
**not** flash `/login`. Clearing that key is how a case forces a logged-out state.

## 4. Personas

Personas map 1:1 to `@erp/contracts` permission strings
(`packages/contracts/src/permissions/catalog.ts`).

**How personas are instantiated — running app (Playwright / Claude for Chrome / manual):**
every persona is a **real logged-in user** via `/login`. There is no runtime permission override:
`main.tsx` always boots the router with the restored session (or null → `/login`), so
`VITE_DEV_PERMISSIONS` has **no effect on the running app** — it shapes the dev user only inside
**Vitest unit tests** (via `createDevUser` / `renderInShell` in `apps/web/src/test/`). Do not plan
browser cases around it.

**Known gap (test-data setup):** the DB seed creates **only** the super-admin
(`superadmin`/`changeme`). Before any limited-persona case can run, its user must exist. Two
options, both to be treated as an explicit precondition:

1. **Bootstrap via Admin UI** (works today): as super-admin, create a role with exactly the
   persona's permission CSV (`/admin/roles`) and a user assigned to it (`/admin/users`) — this is
   also the TC-ADMIN-02 golden path, so run it first and reuse its output. Convention: username =
   persona slug (e.g. `sales-clerk`), one shared test password recorded in the run notes.
2. **Extend the seed** to create the persona users/roles below (preferred long-term for CI
   determinism — flagged as a follow-up; not yet implemented).

| Persona | Permission CSV (role definition) | Instantiate via | Purpose |
|---|---|---|---|
| **Super Admin** | — (super-admin flag bypasses all gates) | Real login `superadmin`/`changeme` (seeded) | Golden paths; Admin module (super-admin-only); persona bootstrap |
| **Sales Clerk** | `sales.quotation.manage,sales.invoice.create,sales.customer.manage,sales.payment.record` | Real login as purpose-created user `sales-clerk` | Sales day-to-day; must NOT see approve/void/e-tax actions, aging, or other modules |
| **Sales Supervisor** | `sales.quotation.manage,sales.invoice.create,sales.invoice.approve,sales.document.void,sales.etax.submit,sales.payment.record,report.sales.view` | Real login as purpose-created user `sales-supervisor` | High-risk sales deep cases: approve, void (+ reason), e-tax submit, aging dashboard |
| **Payroll Approver** | `hr.payroll.approve,hr.ot.approve,hr.salary.view,hr.payslip.view` | Real login as purpose-created user `payroll-approver` | Payroll run calculate→approve, OT approve, tax exports; sees salaries unmasked |
| **HR Officer** | `hr.employee.view,hr.employee.manage` | Real login as purpose-created user `hr-officer` | Employees/org/advances/attendance; salary fields **masked** (no `hr.salary.view`); no payroll/OT nav |
| **Inventory Operator** | `inventory.product.create,inventory.receipt.manage,inventory.issue.manage` | Real login as purpose-created user `inventory-operator` | Items/receipts/issues/counts/barcodes; cost columns **masked** (no `inventory.cost.view`); cannot approve adjustments |
| **Inventory Approver** | `inventory.issue.manage,inventory.adjustment.approve,inventory.cost.view` | Real login as purpose-created user `inventory-approver` | Adjustment-approve deep case; cost visible |
| **Production Scanner** | `production.scan` | Real login as purpose-created user `production-scanner` | Kiosk scan station only — nav shows Production with only Scan; kiosk lockdown case |
| **Production Planner** | `production.wo.manage,production.subcontract.manage` | Real login as purpose-created user `production-planner` | Timeline/work-orders/WIP/subcontracts; no scan station |
| **Reports Viewer** | `report.sales.view,report.inventory.view` | Real login as purpose-created user `reports-viewer` | Reports home + those two dashboards only; cost/profit/tax dashboards absent; report-viewer dynamic gate |
| **None** | *(role with zero permissions)* | Real login as purpose-created user `no-perms` | Sees only Dashboard (`/`, ungated); every gated module absent from nav/palette; direct URLs redirect |

For Vitest **unit** isolation only, `VITE_DEV_PERMISSIONS` (unset/`*` = super-admin, `none` = no
permissions, CSV = exactly those) shapes the in-memory dev user consumed by `renderInShell` — it is
listed here solely so nobody mistakes it for a browser-level login bypass.

Gate parity is the invariant under test everywhere: unpermitted modules are **absent from the DOM**
(sidebar, mobile tab bar, drawer, command palette) *and* the route guard redirects — the same
`filterNav` source drives all of them. Module roots (`/inventory`, `/sales`, …) redirect to the first
accessible child. `/admin` additionally requires super-admin regardless of `iam.*` permissions.

## 5. Tooling: one catalog, two executors

The catalog under `test-cases/` is the single source of truth. Every case uses this template
(exactly — it reads for humans, feeds Claude for Chrome verbatim, and maps 1:1 to a Playwright test):

```
### TC-<MODULE>-<NN> — <title>
- **Target**: App @ :5173 <route>  |  or  Storybook @ :6006 (story id)
- **Persona**: super-admin | <permission CSV> | none
- **Preconditions**: seeded data / route / prior state
- **Priority**: smoke | golden-path | permission-gate | high-risk
- **Steps**:
  1. <UI-observable action>
  2. ...
- **Expected**:
  1. <assertion on visible UI: text / chip status / disabled / toast / URL>
  2. ...
- **Automation notes**: stable selectors (prefer ARIA role+name, then existing test ids); Playwright/Chrome hints; any missing test-hook to flag.
```

Module prefixes: `TC-XC` cross-cutting (`00-cross-cutting.md`), `TC-INV` inventory, `TC-PROD`
production, `TC-SALES` sales, `TC-HR` hr, `TC-RPT` reports, `TC-ADMIN` admin, `TC-CMP` components
(`99-components.md`). Numbering convention within each module: **-01 smoke, -02 golden path,
-03 permission gate, -04+ high-risk deep** (the catalog files are authoritative for exact ids).

| Tool | Strengths | Role |
|---|---|---|
| **Playwright** (`e2e/`) | Deterministic, fast, CI-able; traces + HTML report; storage-state personas | Regression suite. `tests/smoke.spec.ts` iterates the nav registry; `tests/sales.spec.ts` is the fully-coded reference module; remaining catalog cases are codified incrementally from their **Automation notes** |
| **Claude for Chrome** (`claude-chrome-runbook.md`) | Executes natural-language steps as written; judges visual/semantic correctness; ad-hoc — no code needed for a new case | Exploratory passes, new-screen validation before Playwright exists, theme/density/i18n spot-checks, kiosk full-screen checks, triaging Playwright failures |

Selector policy (binds both tools): prefer ARIA role + accessible name (`@erp/ui` enforces
`aria-label` on icon-only buttons and FormField aria wiring, so these exist), then existing
`data-testid`s. Cases must **flag** missing hooks in Automation notes — never work around them with
brittle CSS/text-position selectors, and never add hooks to app code as part of a test change.

## 6. Coverage matrix

Rows are **every route** in `apps/web/src/nav/registry.ts` + the `$id` detail routes registered
directly in `src/router/route-tree.tsx`. Legend: ✓ covered (owning TC ids per the numbering
convention above) · — intentionally not applicable. Module-root paths (`/inventory`, `/production`,
`/sales`, `/hr`, `/admin`) are redirect-only (no screen); their redirect behavior is asserted by
TC-XC module-root-redirect and each module's smoke case.

### Cross-cutting (`00-cross-cutting.md`, TC-XC-*)

| Behavior / route | Covered by |
|---|---|
| `/login` success / failure / disabled-until-filled | TC-XC login cases |
| `?notice=reauth` / `?notice=session-expired` banners | TC-XC |
| Session restore on reload (no `/login` flash) | TC-XC |
| Permission-gated nav / palette / route **parity** + super-admin bypass | TC-XC |
| Module-root redirect to first accessible child | TC-XC |
| Theme toggle (persist, OS-follow) · density (persist; Touch on kiosk, non-overridable) · locale TH↔EN | TC-XC |
| Command palette: Cmd/Ctrl-K toggle, `/` open, Esc close, permission-filtered entries | TC-XC |
| Kiosk lockdown chrome stripping (`/production/scan`) | TC-XC + TC-PROD deep |
| `/` Dashboard (reporting overview, cross-filter search params) — ungated | TC-XC smoke; deep charts under TC-RPT |

### Inventory (`01-inventory.md`, TC-INV-*)

| Route | smoke | golden-path | permission-gate | high-risk-deep |
|---|---|---|---|---|
| `/inventory/items` (+ `/inventory/items/$id`) | ✓ TC-INV-01 | ✓ TC-INV-02 (item create → detail) | ✓ TC-INV-03 | — |
| `/inventory/receipts` | ✓ TC-INV-01 | ✓ TC-INV-02 (goods-receipt wizard) | ✓ TC-INV-03 | ✓ TC-INV-04+ (landed cost) |
| `/inventory/issues` (kiosk Touch) | ✓ TC-INV-01 | — | ✓ TC-INV-03 | ✓ TC-INV-04+ (scan-first issue, Touch density) |
| `/inventory/counts` | ✓ TC-INV-01 | — | ✓ TC-INV-03 | ✓ TC-INV-04+ (count reconcile) |
| `/inventory/adjustments` | ✓ TC-INV-01 | — | ✓ TC-INV-03 (Operator cannot approve) | ✓ TC-INV-04+ (adjustment approve, Approver persona) |
| `/inventory/barcodes` | ✓ TC-INV-01 | — | ✓ TC-INV-03 | — |
| `/inventory/reports` | ✓ TC-INV-01 | — | ✓ TC-INV-03 (cost masking sans `inventory.cost.view`) | — |

### Production (`02-production.md`, TC-PROD-*)

| Route | smoke | golden-path | permission-gate | high-risk-deep |
|---|---|---|---|---|
| `/production/timeline` (realtime) | ✓ TC-PROD-01 | — | ✓ TC-PROD-03 | ✓ TC-PROD-04+ (realtime update, alert rail) |
| `/production/work-orders` (+ `/$id`, realtime) | ✓ TC-PROD-01 | ✓ TC-PROD-02 (WO lifecycle) | ✓ TC-PROD-03 | — |
| `/production/scan` (kiosk + **lockdown**) | ✓ TC-PROD-01 | — | ✓ TC-PROD-03 (Scanner sees only Scan) | ✓ TC-PROD-04+ (scan flow, defect picker, offline queue, lockdown) |
| `/production/wip` | ✓ TC-PROD-01 | — | ✓ TC-PROD-03 | — |
| `/production/subcontracts` | ✓ TC-PROD-01 | — | ✓ TC-PROD-03 | ✓ TC-PROD-04+ (SLA chip states) |

### Sales (`03-sales.md`, TC-SALES-*)

| Route | smoke | golden-path | permission-gate | high-risk-deep |
|---|---|---|---|---|
| `/sales/documents` (+ `/$id`, `/$id/edit`) | ✓ TC-SALES-01 | ✓ TC-SALES-02 (quotation → send → convert → invoice issue) | ✓ TC-SALES-03 (Clerk: no approve/void) | ✓ TC-SALES-04+ (invoice void + reason; VAT mode; WHT net-to-receive; promptpay QR; e-tax submit) |
| `/sales/customers` (+ `/$id`) | ✓ TC-SALES-01 | ✓ within TC-SALES-02 (customer autocomplete/create) | ✓ TC-SALES-03 | — |
| `/sales/payments` | ✓ TC-SALES-01 | ✓ within TC-SALES-02 (record payment) | ✓ TC-SALES-03 | ✓ TC-SALES-04+ (partial payment / overpay guard) |
| `/sales/templates` | ✓ TC-SALES-01 | — | ✓ TC-SALES-03 | — |
| `/sales/aging` (`report.sales.view`) | ✓ TC-SALES-01 | — | ✓ TC-SALES-03 (Clerk: absent) | — |

### HR & Payroll (`04-hr.md`, TC-HR-*)

| Route | smoke | golden-path | permission-gate | high-risk-deep |
|---|---|---|---|---|
| `/hr/employees` (+ `/$id`) | ✓ TC-HR-01 | ✓ TC-HR-02 (employee CRUD) | ✓ TC-HR-03 (salary **masked** for HR Officer) | — |
| `/hr/org` | ✓ TC-HR-01 | — | ✓ TC-HR-03 | — |
| `/hr/ot` | ✓ TC-HR-01 | — | ✓ TC-HR-03 (Approver-only nav) | ✓ TC-HR-04+ (OT create-drawer → submit → approve) |
| `/hr/advances` | ✓ TC-HR-01 | — | ✓ TC-HR-03 | ✓ TC-HR-04+ (cash-advance approve **re-auth**, ceiling check) |
| `/hr/attendance` | ✓ TC-HR-01 | — | ✓ TC-HR-03 | — |
| `/hr/payroll` (+ `/hr/payroll/runs/$id`) | ✓ TC-HR-01 | — | ✓ TC-HR-03 | ✓ TC-HR-04+ (payroll run calculate → approve; payslip breakdown) |
| `/hr/tax-exports` | ✓ TC-HR-01 | — | ✓ TC-HR-03 | — |

### Reports (`05-reports.md`, TC-RPT-*)

| Route | smoke | golden-path | permission-gate | high-risk-deep |
|---|---|---|---|---|
| `/reports` (catalog home) | ✓ TC-RPT-01 | ✓ TC-RPT-02 (browse → open report) | ✓ TC-RPT-03 (catalog filtered by group perms) | — |
| `/reports/dashboards/inventory` | ✓ TC-RPT-01 | — | ✓ TC-RPT-03 | — |
| `/reports/dashboards/sales` | ✓ TC-RPT-01 | ✓ within TC-RPT-02 (cross-filter → viewer) | ✓ TC-RPT-03 | — |
| `/reports/dashboards/cost` | ✓ TC-RPT-01 | — | ✓ TC-RPT-03 (route absent for Reports Viewer; KPI masking sans `inventory.cost.view`) | — |
| `/reports/dashboards/profit` | ✓ TC-RPT-01 | — | ✓ TC-RPT-03 | — |
| `/reports/dashboards/tax` | ✓ TC-RPT-01 | — | ✓ TC-RPT-03 | — |
| `/reports/$reportKey` (16 catalog keys, **dynamic** gate) | ✓ TC-RPT-01 (one key per group) | ✓ within TC-RPT-02 | ✓ TC-RPT-03 (direct URL to ungranted group redirects) | ✓ TC-RPT-04+ (filters/search params round-trip) |
| `/reports/schedules` | ✓ TC-RPT-01 | — | ✓ TC-RPT-03 (`report.schedule.manage`) | ✓ TC-RPT-04+ (schedule create cron + run-now) |

### Admin & Access (`06-admin.md`, TC-ADMIN-*) — all super-admin-only

| Route | smoke | golden-path | permission-gate | high-risk-deep |
|---|---|---|---|---|
| `/admin/users` (+ `/$id`) | ✓ TC-ADMIN-01 | ✓ TC-ADMIN-02 (create user + assign role) | ✓ TC-ADMIN-03 (non-super-admin with `iam.*`: still absent) | ✓ TC-ADMIN-04+ (force-logout, session list) |
| `/admin/roles` (+ `/$id`) | ✓ TC-ADMIN-01 | ✓ within TC-ADMIN-02 (role create via permission matrix) | ✓ TC-ADMIN-03 | ✓ TC-ADMIN-04+ (role clone; delete **re-auth**) |
| `/admin/audit` | ✓ TC-ADMIN-01 | — | ✓ TC-ADMIN-03 | ✓ TC-ADMIN-04+ (before/after diff of a change made in-suite) |
| `/admin/import` | ✓ TC-ADMIN-01 | — | ✓ TC-ADMIN-03 | ✓ TC-ADMIN-04+ (permission CSV validation errors) |

### Components — Storybook (`99-components.md`, TC-CMP-*)

Priority set: **DataTable** (sort asc→desc→none; cursor pagination — Next disables on `next_cursor:
null`; magenta bulk-select bar; column presets persist to localStorage; roving-tabindex keyboard nav;
`density="touch"` hides secondary columns; skeleton/empty/error+Retry), **InkChip** (status mapping;
void = muted + strikethrough), **ConfirmDialog / GuardedActionDialog** (consequence + required reason
+ re-auth), **Combobox/Select** (type-filter, keyboard), **Wizard** (step gating), **ScanField**
(enter-to-add, dedupe), **Toast** (job-toast progress), **FormField** (aria wiring), **MoneyCell/
QtyCell** (string-in formatting), **PermissionButton/HasPermission/MaskedValue**. Remaining
primitives (Icon, Input, Checkbox, RadioGroup, Switch, Tooltip, Badge, Avatar, Skeleton, Dialog,
Drawer) keep their Vitest coverage; UI-level cases are added only when a browser-only behavior
(overlay layering, focus trap) needs checking.

### Not-yet-built placeholder routes

`/inventory/receipts/$id` and `/inventory/counts/$id` are registered but render the shared
`ModulePlaceholder` (the contract has no per-id GET yet; receipts/counts are managed inline on their
list screens). Coverage = smoke-level only: the route resolves, shows the placeholder, and honors its
permission gate. **When either grows a real screen, add golden-path/deep cases in `01-inventory.md`
and update this matrix — treat a non-placeholder render of these routes as a matrix TODO.** Module
root paths and `/login` are accounted for under cross-cutting above. No other registry route is
omitted.

## 7. Pass/fail criteria & reporting

A case **passes** only if **every** numbered Expected assertion holds. Fail states:

- **FAIL** — an assertion is observably violated (wrong text/state/URL, action available to an
  unpermitted persona, error toast on a golden path).
- **BLOCKED** — a precondition can't be met (missing seed data, earlier case failed). Not a pass.
- **FLAKY** — passes on retry; record it, don't ignore it (cf. the known full-suite userEvent
  flakiness under load — isolate before blaming the app).

Reporting:

- **Screenshots** go to `debugging/` (git-ignored working area), named
  `<TC-ID>-<step|fail>-<short-desc>.png`, e.g. `debugging/TC-SALES-04-fail-void-reason-missing.png`.
  Claude for Chrome captures on each Expected checkpoint and always on failure; Playwright is
  configured for screenshot + trace **on failure**.
- **Playwright HTML report** (`e2e/playwright-report/`): the run artifact for automated passes —
  open with `npx playwright show-report`; in CI it uploads as a build artifact.
- **Manual / Chrome runs**: a per-run results table (case id → PASS/FAIL/BLOCKED + evidence path +
  one-line note), produced per the runbook. File defects referencing the TC id so the case doubles
  as the regression check.

## 8. CI hook (described, not yet implemented)

Add an `e2e` job to `.github/workflows/ci.yml` alongside the existing `verify` (lint/typecheck/
test/build, affected-only) and `integration` (Testcontainers) jobs:

- `runs-on: ubuntu-latest`; checkout, pnpm + Node 22 setup, `pnpm install --frozen-lockfile` (same
  preamble as `verify`).
- Start infra: `docker compose -f infra/docker-compose.yml up -d --wait` (Docker is available on the
  runner), then `pnpm db:migrate && pnpm db:seed`. Note the persona gap (§4): until the seed creates
  the limited-persona users, the job (or a Playwright global-setup) must bootstrap them as
  super-admin via the Admin UI/API before persona-gated specs run.
- Build and start the app: `pnpm build`, then run api + web (built preview or `pnpm dev`) in the
  background; wait for `:5173`/`:3000` health.
- `npx playwright install --with-deps chromium`, then run the `e2e` suite (smoke + reference specs
  first; grow as catalog cases are codified).
- Upload `e2e/playwright-report/` and any `debugging/` failure screenshots via
  `actions/upload-artifact`.
- Gate policy: start **non-blocking** (or `main`-only / nightly) until the suite proves stable, then
  promote to a required check. Keep it out of the affected-only turbo graph — the job invokes
  Playwright directly.

## 9. Maintenance rules

1. **New screen/route ⇒ new smoke case** in the owning module file **and a matrix row here** — the
   nav registry (`apps/web/src/nav/registry.ts`) is the checklist; a registry diff without a matrix
   diff is a review flag.
2. **New permission ⇒ persona review** — extend or add a persona CSV so both sides of the gate stay
   covered.
3. Golden paths are updated in the same PR that changes their flow; Automation notes list any test
   hook the app should add (tracked as follow-ups, never hacked around).
4. Placeholder routes graduating to real screens move from smoke-only to full row coverage (see the
   placeholder note above).
