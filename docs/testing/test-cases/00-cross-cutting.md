# Cross-cutting UI test cases (TC-XC)

Behaviors of the app shell that every module inherits: login/session, permission-gated nav parity,
theme/density/locale, the command palette, and kiosk routes. Target is the running app at
`http://localhost:5173` (stack up via `docker compose -f infra/docker-compose.yml up -d`, `pnpm db:seed`, `pnpm dev`).

> **Locale note**: the app boots in Thai (`th`) by default. Every quoted string below is the English
> resource (`apps/web/src/i18n/resources/en.ts`). Automated runs should either switch the language
> first (see TC-XC-14) or persist `en` in the locale storage key before navigation.

> **Persona note (test-data gap)**: `VITE_DEV_PERMISSIONS` is **not** a login bypass in the running
> app — `main.tsx` always injects the real restored session, so the dev-user env only shapes Vitest
> unit tests. Limited personas below must be **real users** created via the Admin UI
> (`/admin/roles` → role with the wanted permission CSV, `/admin/users` → user with that role).
> **FLAG**: the seed ships only `superadmin` — seeded limited-permission fixture users (e.g.
> `sales-only`, `no-perms`) are a missing test hook. The isolated nav-filter logic is already
> unit-tested via `renderInShell(ui, { user: userWith([...]) })` in `apps/web/src/test`.

## Coverage checklist

- [x] Login success / failure / disabled submit (TC-XC-01, 02)
- [x] Re-auth + session-expired notice banners (TC-XC-03, 04)
- [x] Session restore on reload — no `/login` flash (TC-XC-05)
- [x] Permission parity: none persona, single-module persona (sidebar + palette + URL), super-admin bypass (TC-XC-06..09)
- [x] Module-root redirect to first accessible child (TC-XC-10)
- [x] Theme toggle: persist + follows OS until explicit (TC-XC-11, 12)
- [x] Density toggle: compact persists (TC-XC-13)
- [x] Locale toggle TH↔EN live + `<html lang>` (TC-XC-14)
- [x] Command palette: Cmd/Ctrl-K, `/`, Esc, select-navigates (TC-XC-15..17)
- [x] Kiosk Touch auto-density (issues + scan) and kiosk lockdown (TC-XC-18..20)

## Login & session

### TC-XC-01 — Login succeeds with seed super-admin and lands on `/`
- **Target**: App @ :5173 `/login`
- **Persona**: super-admin (seed `superadmin` / `changeme`, or `SEED_SUPERADMIN_PASSWORD`)
- **Preconditions**: seeded DB; logged out (clear localStorage key `erp.refresh_token`); on `/login`
- **Priority**: smoke
- **Steps**:
  1. Observe the "Sign in" button with both fields empty.
  2. Type `superadmin` into the "Username" field.
  3. Observe the "Sign in" button again (one field filled).
  4. Type `changeme` into the "Password" field and click "Sign in".
- **Expected**:
  1. "Sign in" is disabled while either field is empty (steps 1 and 3).
  2. URL becomes `/` and the dashboard renders inside the shell (sidebar + topbar visible).
  3. No error Badge appears.
- **Automation notes**: `getByRole("textbox", { name: "Username" })`, `getByLabel("Password")` (password inputs are not role=textbox), `getByRole("button", { name: "Sign in" })`. Assert `expect(page).toHaveURL("/")`. Button shows "Signing in…" transiently — don't race on it.

### TC-XC-02 — Login failure shows the danger Badge, stays on `/login`
- **Target**: App @ :5173 `/login`
- **Persona**: none (unauthenticated)
- **Preconditions**: logged out; on `/login`
- **Priority**: smoke
- **Steps**:
  1. Enter `superadmin` / `wrong-password` and click "Sign in".
- **Expected**:
  1. A danger-tone Badge appears with "Incorrect username or password."
  2. URL stays `/login`; fields keep their values; "Sign in" is re-enabled.
- **Automation notes**: assert `getByText("Incorrect username or password.")` visible. The Badge is tone `danger` — no test id; text match is the stable hook.

### TC-XC-03 — `?notice=reauth` shows the re-auth warning banner
- **Target**: App @ :5173 `/login?notice=reauth`
- **Persona**: none (unauthenticated)
- **Preconditions**: logged out
- **Steps**:
  1. Navigate directly to `/login?notice=reauth`.
- **Priority**: golden-path
- **Expected**:
  1. A warning-tone Badge shows "Your access changed. Please sign in again."
  2. The login form is otherwise normal; signing in with valid creds proceeds to `/`.
- **Automation notes**: search-param validation strips unknown values — `?notice=bogus` renders no banner (worth a negative assertion). Text match on the English string after switching locale.

### TC-XC-04 — `?notice=session-expired` shows the expiry warning banner
- **Target**: App @ :5173 `/login?notice=session-expired`
- **Persona**: none (unauthenticated)
- **Preconditions**: logged out
- **Priority**: golden-path
- **Steps**:
  1. Navigate directly to `/login?notice=session-expired`.
- **Expected**:
  1. A warning-tone Badge shows "Your session expired. Please sign in again."
- **Automation notes**: same hooks as TC-XC-03. End-to-end trigger (refresh-token rejection redirecting here with the param) is an API-level scenario; this case covers the UI contract only.

### TC-XC-05 — Session restores on reload with no `/login` flash
- **Target**: App @ :5173 `/` (reload)
- **Persona**: super-admin
- **Preconditions**: logged in (TC-XC-01); localStorage `erp.refresh_token` present
- **Priority**: high-risk
- **Steps**:
  1. From `/`, hard-reload the page (Cmd/Ctrl-Shift-R).
  2. Watch the URL and first paint until the dashboard is interactive.
- **Expected**:
  1. `restoreSession()` completes before first render — the URL never becomes `/login` at any point.
  2. The shell renders logged-in (sidebar populated) without re-entering credentials.
- **Automation notes**: Playwright — register `page.on("framenavigated", …)` before `page.reload()` and assert no navigation URL contained `/login`; or `await page.reload(); expect(page.url()).not.toContain("/login")` plus a `waitForURL` guard. A brief blank/splash state before render is acceptable; a `/login` paint is the bug.

## Permission-gated parity

### TC-XC-06 — Persona with no permissions sees no modules anywhere
- **Target**: App @ :5173 `/`
- **Persona**: none (real user whose role has zero permissions — see persona note)
- **Preconditions**: super-admin pre-created a role with no permissions + a user `noperm` on it (**FLAG: no seeded fixture user**); logged in as `noperm`
- **Priority**: permission-gate
- **Steps**:
  1. Land on `/` and inspect the sidebar and mobile tab bar.
  2. Open the command palette (Ctrl/Cmd-K) and read its entries.
  3. Navigate by URL to `/inventory/items`, `/sales/documents`, `/admin/users`.
- **Expected**:
  1. No module entries render in the sidebar — unpermitted modules are **absent from the DOM**, not disabled. Dashboard (`/`) is ungated and still reachable.
  2. The palette lists no module navigation entries.
  3. Each direct URL redirects back to `/` (admin is super-admin-only).
- **Automation notes**: assert `getByRole("navigation")` contains no link for e.g. "Inventory"; `expect(locator).toHaveCount(0)` (absence, not `toBeDisabled`). Guards throw `redirect({ to: "/" })` — assert final URL.

### TC-XC-07 — Single-module persona: sidebar and palette show only that module
- **Target**: App @ :5173 `/`
- **Persona**: `sales.quotation.manage,sales.invoice.create` (real user via Admin UI)
- **Preconditions**: role with exactly those permissions + user `salesonly` (**FLAG: no seeded fixture**); logged in as `salesonly`
- **Priority**: permission-gate
- **Steps**:
  1. Inspect the sidebar module list.
  2. Open the command palette (Ctrl/Cmd-K) and read every entry.
- **Expected**:
  1. Sidebar shows Dashboard + Sales only; Inventory/Production/HR/Reports/Admin are absent from the DOM.
  2. Palette entries are the same filtered set (same `filterNav` source) — Sales destinations only.
- **Automation notes**: nav and palette are driven by one registry (`src/nav/registry.ts` + `filterNav`) — parity is the assertion. Compare the accessible names of sidebar links vs `[cmdk-item]` texts.

### TC-XC-08 — Single-module persona cannot reach other modules by URL
- **Target**: App @ :5173 `/hr/employees`
- **Persona**: `sales.quotation.manage,sales.invoice.create`
- **Preconditions**: as TC-XC-07; logged in as `salesonly`
- **Priority**: permission-gate
- **Steps**:
  1. Navigate directly to `/hr/employees`, then `/inventory/items`, then `/admin`.
  2. Navigate to `/sales/documents`.
- **Expected**:
  1. Each unpermitted URL redirects to `/` via the route `beforeLoad` guard — no flash of the gated screen, no error page.
  2. `/sales/documents` renders normally.
- **Automation notes**: `await page.goto("/hr/employees"); await expect(page).toHaveURL("/")`. Route, nav, and palette all filter through the same permission check — this closes the parity triangle started in TC-XC-07.

### TC-XC-09 — Super-admin bypasses every gate; Admin is bottom-anchored
- **Target**: App @ :5173 `/`
- **Persona**: super-admin
- **Preconditions**: logged in as `superadmin`
- **Priority**: permission-gate
- **Steps**:
  1. Inspect the sidebar; note the position of "Admin & Access".
  2. Open the palette; then visit `/admin/users`, `/hr/payroll`, `/inventory/adjustments` by URL.
- **Expected**:
  1. All modules render; "Admin & Access" is the bottom-anchored last group.
  2. Every route loads without redirect — super-admin bypasses all permission checks.
- **Automation notes**: assert the Admin link is the last nav item (`nav.getByRole("link").last()`).

### TC-XC-10 — Module root redirects to the first accessible child
- **Target**: App @ :5173 `/inventory`
- **Persona**: super-admin (repeat with a limited persona)
- **Preconditions**: logged in
- **Priority**: golden-path
- **Steps**:
  1. Navigate to `/inventory` (module root, no child segment).
  2. As a user whose only inventory permission is `inventory.receipt.manage`, navigate to `/inventory` again.
- **Expected**:
  1. Redirects to the first child the user can access — `/inventory/items` for super-admin.
  2. For the receipts-only persona, redirects to its first *accessible* child (`/inventory/receipts`), never a gated one.
- **Automation notes**: `expect(page).toHaveURL(/\/inventory\/\w+/)`. Step 2 needs the Admin-created persona (same fixture gap as TC-XC-06/07).

## Theme, density, locale

### TC-XC-11 — Theme toggle flips `data-theme` and persists across reload
- **Target**: App @ :5173 `/` (topbar)
- **Persona**: super-admin
- **Preconditions**: logged in; OS/emulated color scheme light (so app starts light)
- **Priority**: smoke
- **Steps**:
  1. Click the topbar theme button (accessible name "Switch to dark").
  2. Reload the page.
- **Expected**:
  1. `<html data-theme="dark">`; ink surfaces re-resolve (sidebar chrome stays ink in both themes); the button's name becomes "Switch to light".
  2. After reload, `data-theme="dark"` is restored (persisted preference).
- **Automation notes**: `getByRole("button", { name: "Switch to dark" })`; assert `page.locator("html")` attribute. Attribute lives on `<html>`, not a wrapper — portaled overlays inherit it.

### TC-XC-12 — Theme follows the OS until an explicit choice is made
- **Target**: App @ :5173 `/`
- **Persona**: super-admin
- **Preconditions**: logged in; **no stored theme preference** (clear the theme localStorage key)
- **Priority**: golden-path
- **Steps**:
  1. Emulate OS dark (`page.emulateMedia({ colorScheme: "dark" })`) and load the app.
  2. Flip emulation to light while the app is open.
  3. Click the theme toggle once (explicit choice), then flip OS emulation again.
- **Expected**:
  1. App renders with `data-theme="dark"` (follows OS via `matchMedia` in JS — there is no `prefers-color-scheme` rule in tokens.css).
  2. `data-theme` follows to `"light"` live.
  3. After the explicit toggle, further OS changes no longer alter `data-theme`.
- **Automation notes**: precedence logic is pure (`src/theme/resolve-theme.ts`, unit-tested) — this is the E2E confirmation. Clearing the persisted key between runs is essential.

### TC-XC-13 — Density toggle: Compact persists; hidden in Touch
- **Target**: App @ :5173 `/` (topbar)
- **Persona**: super-admin
- **Preconditions**: logged in; on a non-kiosk route
- **Priority**: golden-path
- **Steps**:
  1. Click the density toggle (aria-label contains the density-toggle a11y label + "Compact").
  2. Reload the page.
  3. Navigate to `/inventory/issues` (kiosk) and look for the density toggle.
- **Expected**:
  1. `<html data-density="compact">`; rows/controls tighten; the toggle now offers "Comfortable".
  2. Compact is restored after reload (persisted).
  3. The toggle is **not rendered** on kiosk routes (returns null when density is touch).
- **Automation notes**: the button's aria-label is composed (`a11y.densityToggle` + ": Compact") — prefer `getByRole("button", { name: /Compact|Comfortable/ })`. Assert `data-density` on `<html>`.

### TC-XC-14 — Locale toggle TH↔EN is live and sets `<html lang>`
- **Target**: App @ :5173 `/` (topbar)
- **Persona**: super-admin
- **Preconditions**: logged in; app in default Thai locale
- **Priority**: smoke
- **Steps**:
  1. Read the sidebar/topbar labels (Thai).
  2. Click the language toggle (it names the language you'll switch **to** — "English" while in Thai).
  3. Reload.
- **Expected**:
  1. `<html lang="th">` initially.
  2. All visible shell strings swap to English immediately (no reload); `<html lang="en")`; the toggle now reads "ภาษาไทย".
  3. English persists across reload.
- **Automation notes**: assert `lang` attribute on `html` plus one known string flip (e.g. topbar search placeholder → "Search or jump to…"). The `:lang(th)` typographic resets (no uppercase/tracking) also switch — visual check only.

## Command palette

### TC-XC-15 — Cmd/Ctrl-K toggles the palette; Esc closes it
- **Target**: App @ :5173 `/`
- **Persona**: super-admin
- **Preconditions**: logged in; palette closed
- **Priority**: smoke
- **Steps**:
  1. Press Ctrl-K (or Cmd-K on macOS).
  2. Press Ctrl-K again.
  3. Reopen with Ctrl-K, then press Esc.
- **Expected**:
  1. The palette dialog opens with the search input focused (placeholder "Search or jump to…") listing permission-filtered destinations.
  2. Ctrl-K **toggles** — the palette closes.
  3. Esc closes it (handled by cmdk's Radix dialog, not the shell keymap).
- **Automation notes**: one `window` keydown listener (`useCommandKeymap`); dialog is cmdk — target `[cmdk-root]`/`[cmdk-input]` or `getByRole("dialog")`. **FLAG**: no `data-testid` on the palette; the cmdk attribute selectors are the stable hook.

### TC-XC-16 — `/` opens the palette only when focus is not in an editable field
- **Target**: App @ :5173 `/`
- **Persona**: super-admin
- **Preconditions**: logged in; palette closed
- **Priority**: golden-path
- **Steps**:
  1. With body focus (click empty page area), press `/`.
  2. Close it. Focus any text input (e.g. a list search box), press `/`.
- **Expected**:
  1. The palette opens; the `/` character is not leaked into the palette input's query.
  2. The palette does **not** open; `/` is typed into the focused input (INPUT/TEXTAREA/SELECT/contentEditable are exempt).
- **Automation notes**: `page.keyboard.press("/")` after `page.locator("body").click()`. `/` only opens (never closes) — pressing `/` while open does nothing.

### TC-XC-17 — Selecting a palette entry navigates and closes
- **Target**: App @ :5173 `/`
- **Persona**: super-admin
- **Preconditions**: logged in
- **Priority**: smoke
- **Steps**:
  1. Open the palette (Ctrl-K), type a destination fragment (e.g. "work" for Work orders).
  2. Arrow to the entry and press Enter (repeat via mouse click).
- **Expected**:
  1. Entries filter to matches.
  2. URL changes to the destination (e.g. `/production/work-orders`), the palette closes, and the screen renders.
- **Automation notes**: entries come from the same nav registry as the sidebar; assert URL + palette absence after selection.

## Kiosk routes

### TC-XC-18 — `/inventory/issues` auto-applies Touch density, non-overridable
- **Target**: App @ :5173 `/inventory/issues`
- **Persona**: super-admin (or `inventory.issue.manage`)
- **Preconditions**: logged in; density preference set to Compact beforehand (TC-XC-13)
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/inventory/issues`.
  2. Look for the topbar density toggle.
  3. Navigate back to `/inventory/items`.
- **Expected**:
  1. `<html data-density="touch">` regardless of the stored Compact preference (kiosk metadata wins).
  2. The density toggle is absent — Touch cannot be overridden on kiosk routes.
  3. Density returns to the stored preference (compact) on leaving the kiosk route.
- **Automation notes**: kiosk flag comes from route `staticData` read via `useMatches`. Assert the `data-density` attribute transitions on navigation, not reload.

### TC-XC-19 — `/production/scan` auto-applies Touch density
- **Target**: App @ :5173 `/production/scan`
- **Persona**: super-admin (or `production.scan`)
- **Preconditions**: logged in; density preference Comfortable
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/production/scan`.
- **Expected**:
  1. `<html data-density="touch">`; touch-scale controls (larger tap targets, `--density-*` tokens re-resolve).
- **Automation notes**: same mechanics as TC-XC-18; the scan screen additionally sets `kioskLockdown` — chrome assertions live in TC-XC-20.

### TC-XC-20 — Kiosk lockdown on `/production/scan` strips all shell chrome
- **Target**: App @ :5173 `/production/scan`
- **Persona**: super-admin (or `production.scan`)
- **Preconditions**: logged in; verify at both desktop and mobile viewport widths
- **Priority**: high-risk
- **Steps**:
  1. Navigate to `/production/scan`.
  2. Inspect the DOM for sidebar, topbar, and mobile tab bar.
  3. Press Ctrl-K and `/`.
  4. Navigate away (browser back) to `/production/work-orders`.
- **Expected**:
  1. The scan screen renders full-bleed.
  2. Sidebar, topbar, tab bar, and nav drawer are **absent from the DOM** (not merely hidden).
  3. The command palette does not open — lockdown strips the palette too.
  4. Chrome returns intact on the next non-lockdown route.
- **Automation notes**: assert `getByRole("navigation")` count 0 and no `[cmdk-root]` after keypress. **FLAG**: a `data-testid="shell-chrome"` wrapper would make the absence assertion cheaper than enumerating landmarks.
