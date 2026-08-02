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
pnpm db:migrate && pnpm db:seed                     # schema + super-admin (superadmin / changeme)
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
| `tests/auth.setup.ts` | logs in once as super-admin, saves `.auth/superadmin.json` |
| `tests/smoke.spec.ts` | every leaf route in the nav registry renders (super-admin) |
| `tests/sales.spec.ts` | **reference** module golden path — copy this shape per module |
| `tests/storybook/` | component/primitive cases against Storybook (doc 99) — add here |
| `fixtures/auth.ts` | `login()` (locale-independent selectors) + English/light state |
| `fixtures/personas.ts` | named permission personas → `@erp/contracts` catalog |
| `fixtures/routes.ts` | leaf route list mirrored from `apps/web/src/nav/registry.ts` |

## Personas — important

In the **running app** `VITE_DEV_PERMISSIONS` is **not** a login bypass (it only shapes the Vitest
unit stub). Every persona here is a **real logged-in user**, and the seed creates only the
super-admin. Limited-persona cases require first creating a user + role via the Admin UI
(`/admin/users`, `/admin/roles`) or extending the seed — a known test-data prerequisite. See the
plan's Personas section.

## Adding a module spec

Copy `tests/sales.spec.ts`: reach the worklist, assert title + primary action, drive the golden
path, assert each state transition on its status chip. Prefer ARIA role+name selectors; if a screen
lacks a stable hook, add a note in the case's *Automation notes* (and flag the missing `data-testid`)
rather than binding to brittle CSS.

## CI

Not yet wired. Add an `e2e` job beside `verify`/`integration` in `.github/workflows/ci.yml` that
starts the compose stack, seeds, runs `pnpm dev` in the background, then `pnpm --filter @erp/e2e test`.
Keep it a separate (non-affected) job — it needs the full stack, unlike the unit `verify` job.
