# @erp/e2e — browser UI e2e (Playwright)

Browser-level UI tests for `apps/web`, the executable half of the UI test plan. The human/Claude
test-case catalog lives in [`docs/testing/`](../docs/testing/) — start with
[`UI_TEST_PLAN.md`](../docs/testing/UI_TEST_PLAN.md).

## Install

```bash
pnpm install                        # picks up this workspace
pnpm --filter @erp/e2e install-browsers   # playwright install chromium
```

## Bring up the stack (required — this suite does not boot it)

```bash
docker compose -f infra/docker-compose.yml up -d   # Postgres/Redis/MinIO
pnpm db:migrate && SEED_TEST_DATA=1 pnpm db:seed    # schema + super-admin + personas + master data
pnpm dev                                            # web :5173 → api :3000 (proxied)
# component (Storybook) cases: pnpm --filter @erp/ui storybook   # :6006
```

## Run

```bash
pnpm --filter @erp/e2e test           # full suite (setup → app project)
pnpm --filter @erp/e2e test:smoke     # all-routes smoke only
pnpm --filter @erp/e2e test:ui        # Playwright UI mode
pnpm --filter @erp/e2e report         # open the last HTML report
```

Override targets with `E2E_BASE_URL` (app, default `http://localhost:5173`) and
`E2E_STORYBOOK_URL` (default `http://localhost:6006`). Super-admin creds via
`SEED_SUPERADMIN_USERNAME` / `SEED_SUPERADMIN_PASSWORD`.

## Layout

| Path | What |
|---|---|
| `playwright.config.ts` | projects: `setup` → `app` (:5173, authed) and `storybook` (:6006) |
| `tests/auth.setup.ts` | logs in as super-admin **and every seeded persona**, saving `.auth/<key>.json` each |
| `tests/smoke.spec.ts` | every leaf route in the nav registry renders (super-admin) |
| `tests/sales.spec.ts` | TC-SALES-01/02 — **reference** golden path, copy this shape per module |
| `tests/sales-module.spec.ts` | TC-SALES-03..12 — VAT and WHT arithmetic, PromptPay gating, customers, aging, templates |
| `tests/auth.spec.ts` | TC-XC-01..05 — login, failure badge, notice banners, session restore (runs unauthenticated) |
| `tests/permissions.spec.ts` | TC-XC-06..10 — persona gating, super-admin bypass, module-root redirect |
| `tests/shell.spec.ts` | TC-XC-11..20 — theme, density, locale, command palette, kiosk lockdown |
| `tests/admin.spec.ts` | TC-ADMIN-01..09 — users, roles, permission matrix, guarded delete, audit log, import |
| `tests/inventory-module.spec.ts` | TC-INV-01..11 — items, SKUs, receipt wizard, kiosk scan loop, counts, adjustments, permission gates |
| `tests/production.spec.ts` | TC-PROD-01..11 — timeline, work orders, kiosk lockdown, scan loop, defects, offline queue, WIP |
| `tests/inventory.spec.ts` | UAT journey **J3** procure-to-stock — receipt + landed cost, count, guarded adjustment |
| `tests/hr.spec.ts` | UAT journey **J2** hire-to-payslip — onboarding, OT, attendance reconcile, payroll approve |
| `tests/hr-module.spec.ts` | TC-HR-01, 03..05, 08..10, 13..15 — employees, org, attendance, tax exports, salary masking, payroll gate |
| `tests/storybook/data-table.spec.ts` | TC-CMP-01..08 — sort, cursor pagination, bulk select, presets, keyboard nav, density, empty/error |
| `tests/storybook/primitives.spec.ts` | TC-CMP-09/10, 22–26 — InkChip, FormField ARIA, Money/Qty cells, PermissionButton, MaskedValue |
| `tests/storybook/dialogs-and-inputs.spec.ts` | TC-CMP-11..21 — confirm/guarded dialogs, combobox, select, wizard, scan, toast |
| `fixtures/auth.ts` | `login()` (locale-independent selectors) + English/light state |
| `fixtures/personas.ts` | named permission personas → `@erp/contracts` catalog, `personaCredentials()`/`personaStatePath()` |
| `fixtures/routes.ts` | leaf route list mirrored from `apps/web/src/nav/registry.ts` |

## Personas — important

In the **running app** `VITE_DEV_PERMISSIONS` is **not** a login bypass (it only shapes the Vitest
unit stub). Every persona here is a **real logged-in user** — and `SEED_TEST_DATA=1 pnpm db:seed`
creates all of them: role, user, and binding. **That flag is required**: it is off by default so the
production bootstrap in `infra/k8s/README.md` (same seed file) never creates `changeme` accounts. Username is the persona `key` verbatim (e.g. `salesSupervisor`),
password `SEED_PERSONA_PASSWORD` (default `changeme`); use `personaCredentials(persona)` rather
than hardcoding. `PERSONAS` here and `SEED_PERSONAS` in `packages/db/src/seed/seed.ts` must stay
1:1 — a persona the seed doesn't create cannot log in. See the plan's Personas section.

`tests/auth.setup.ts` logs each persona in once and saves its storage state, so a spec just opts in:

```ts
import { PERSONAS, personaStatePath } from "../fixtures/personas.js";

test.describe("Reports Viewer", () => {
  test.use({ storageState: personaStatePath(PERSONAS.reportsViewer!) });
  // …tests here run as that persona, overriding the app project's super-admin default
});
```

## Adding a module spec

Copy `tests/sales.spec.ts`: reach the worklist, assert title + primary action, drive the golden
path, assert each state transition on its status chip. Prefer ARIA role+name selectors; if a screen
lacks a stable hook, add a note in the case's *Automation notes* (and flag the missing `data-testid`)
rather than binding to brittle CSS.

## CI

Wired as **`.github/workflows/e2e.yml`** — its own workflow (PRs, pushes to `main`, and manual
dispatch), *not* a job in `ci.yml`: `deploy.yml` calls `ci.yml` as the release gate, so a job there
would gate every production rollout on this suite. It starts the compose stack, migrates + seeds,
backgrounds the **built api** (`node dist/main.js`) and the **Vite dev** web server separately —
not `pnpm dev`, whose turbo output buffering hides boot failures — waits for `:3000`/`:5173`, then
runs `pnpm --filter @erp/e2e test`.

Storybook is started there too, on :6006, for the `storybook` project's component cases.

It reports true pass/fail but is **not a required check** yet — promote it in branch protection
once it's proven stable. On failure it tails `api.log`/`web.log` inline in the job output and
uploads the HTML report plus `test-results/` traces. See UI_TEST_PLAN.md §8.
