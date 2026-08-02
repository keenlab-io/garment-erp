# Claude for Chrome — UI Test Runbook

How an operator drives the test-case catalog (`docs/testing/test-cases/*.md`) with **Claude for
Chrome** (the `claude-in-chrome` skill and its `mcp__claude-in-chrome__*` browser tools). Companion
to [`UI_TEST_PLAN.md`](UI_TEST_PLAN.md) — read that first for environment, personas, and the
coverage matrix.

## 1. Prerequisites

- Chrome with the **Claude for Chrome extension** installed, connected to a Claude Code session
  that has the `claude-in-chrome` skill available.
- **Site permissions** granted in the extension for both test surfaces:
  - `http://localhost:5173` (the running app)
  - `http://localhost:6006` (Storybook, for TC-CMP cases)
  Without these the browser tools will refuse to act; grant them before starting a run.
- Claude must **invoke the `claude-in-chrome` skill before using any `mcp__claude-in-chrome__*`
  tool** — start the session by asking it to do so.
- The repo checked out at `/workspaces/garment-erp` so Claude can read the case files and write
  screenshots to `debugging/`.

## 2. Bring the stack up

```bash
docker compose -f infra/docker-compose.yml up -d     # Postgres, Redis, MinIO
pnpm db:migrate && pnpm db:seed                       # superadmin / changeme
pnpm dev                                              # web :5173, api :3000, /socket.io realtime
pnpm --filter @erp/ui storybook                       # :6006 — only for TC-CMP cases
```

Sanity check before any case: open `http://localhost:5173` — you should land on `/login` (fresh
profile) or the Dashboard (restored session). If the page is blank, check the `pnpm dev` terminal
before blaming a test case.

## 3. Set the persona (always a real login)

There is **no permission-override backdoor in the running app** — `VITE_DEV_PERMISSIONS` only
affects Vitest unit tests. Every persona is a real logged-in user:

1. **Super Admin**: log in at `/login` as `superadmin` / `changeme` (fields "Username" /
   "Password", button "Sign in" — disabled until both are filled). Success navigates to `/`.
2. **Limited personas** (Sales Clerk, Payroll Approver, …): the seed does **not** create them
   (known gap — see plan §4). First bootstrap as super-admin: create the role with the persona's
   exact permission CSV at `/admin/roles`, then the user at `/admin/users` (username = persona
   slug, e.g. `sales-clerk`). Then **sign out / clear session and log in as that user**.
3. **Switching personas** mid-run: log out via the app; if no logout affordance is available in the
   current chrome, clear the `erp.refresh_token` localStorage key and reload — you must land on
   `/login` (this is itself asserted by a TC-XC case).

Tell Claude which persona is active at the start of each case batch; it must re-login when a case's
**Persona** line differs from the current session.

## 4. Executing a test-case file

Feed Claude **one catalog file at a time** (e.g. `docs/testing/test-cases/03-sales.md`) with a
prompt of this shape:

> Invoke the `claude-in-chrome` skill. Open http://localhost:5173. Execute the test cases in
> `docs/testing/test-cases/03-sales.md` in order. For each case: satisfy **Preconditions** (log in
> as the stated **Persona** first — re-login if the current session differs), perform the **Steps**
> exactly as written, then verify **every** numbered **Expected** assertion against what you
> actually observe. Capture a screenshot at each Expected checkpoint and always on failure, saving
> to `debugging/<TC-ID>-<step|fail>-<short-desc>.png`. Do not mark a case passed unless all
> assertions hold. If a precondition cannot be met, mark it BLOCKED and continue. At the end,
> produce the results table.

Execution rules Claude must follow (they are also stated in each case's template):

- **Steps are UI-observable actions** — click/type/press exactly what the step says; prefer
  elements by ARIA role + accessible name (the cases' Automation notes name the selectors).
- **Expected lines are the pass bar** — assert visible text, chip status (e.g. void = muted +
  strikethrough), disabled state, toast content, and URL. "Looks roughly right" is not a pass.
- **Storybook cases** (`Target: Storybook @ :6006 (story-id)`): navigate to
  `http://localhost:6006/?path=/story/<story-id>` (or the iframe URL
  `http://localhost:6006/iframe.html?id=<story-id>` when chrome-free interaction is needed) and
  interact with the story canvas.
- **Kiosk cases** (`/production/scan`, `/inventory/issues`): verify the chrome itself — lockdown
  must strip sidebar/topbar/tabbar/drawer/palette; Touch density must apply and be non-overridable.
- **Realtime cases** (production timeline / work orders): a second tab can produce the triggering
  change; note in results if a case needs a second actor and you ran single-tab.
- **Console errors**: after each case, check the browser console; unexpected errors on a passing
  case are recorded as a note (and often a defect).
- **Destructive cases** (void, approve, payroll): mind Preconditions — re-seed (`pnpm db:seed`)
  between full runs rather than improvising data.

## 5. Screenshots & evidence

- Save to **`debugging/`** (git-ignored), named `<TC-ID>-<step|fail>-<short-desc>.png`, e.g.
  `debugging/TC-HR-04-step5-payroll-approved-chip.png`,
  `debugging/TC-XC-02-fail-login-flash.png`.
- Minimum evidence per case: one screenshot at the final Expected checkpoint; on failure, a
  screenshot of the violating state **plus** the observed vs expected text in the notes.
- Theme/i18n spot-checks: capture the same screen in light/dark (`data-theme`) and TH/EN pairs so
  differences are reviewable side by side.

## 6. Reporting pass/fail

At the end of a file run, Claude produces a results table:

| Case | Result | Evidence | Note |
|---|---|---|---|
| TC-SALES-01 | PASS | debugging/TC-SALES-01-step2-worklist.png | — |
| TC-SALES-04 | FAIL | debugging/TC-SALES-04-fail-void-reason.png | Void dialog accepted empty reason (Expected 3 violated) |
| TC-SALES-05 | BLOCKED | — | No seeded invoice in ISSUED state after TC-SALES-04 failure |

- **PASS** = every Expected assertion held. **FAIL** = any violated (quote which number).
  **BLOCKED** = precondition unmet. A retried flake is recorded as PASS with a FLAKY note — never
  silently retried away.
- File defects referencing the TC id; the case is then the regression check for the fix.
- Paste or commit the table into the run log the team uses (do not commit `debugging/`).

## 7. When to use Chrome vs Playwright

**Prefer Claude for Chrome for:**

- **Exploratory passes** on new or just-changed screens — no code needed to run a fresh case.
- **Visual/semantic judgment**: layout sanity, chip colors and strikethrough states, masked salary
  and cost values, chart rendering, empty/error states "reading" correctly.
- **Theme / density / i18n spot-checks**: toggle dark mode, compact density, TH↔EN and confirm the
  screen re-resolves correctly (including `<html lang>` and translated labels). Note: the app ships
  TH/EN — there is no RTL locale today, so RTL checks are out of scope until one exists.
- **Kiosk full-screen checks**: scan-station lockdown, Touch density, scan-first focus behavior —
  awkward to assert exhaustively in code, quick to verify by looking.
- **Triaging Playwright failures**: reproduce the failing spec's steps interactively and observe
  where reality diverges.
- **Drafting new cases**: walk the flow once in Chrome, then write the case with verified labels
  and selectors.

**Prefer Playwright for:**

- Deterministic **regression** on every PR/nightly — stable, fast, retryable, CI-reportable.
- Anything needing **precise waits, network interception, or storage-state** persona reuse.
- The all-routes **smoke sweep** (generated from the nav registry) — mechanical and dull, perfect
  for code.
- Long golden paths run repeatedly (sales document lifecycle) once their steps have stabilized.

The two tools share one catalog: a case validated interactively in Chrome should eventually be
codified in `e2e/` from its Automation notes; a case that only exists as Playwright code should be
back-filled into the catalog so humans and Claude can run it too.
