import { test, expect } from "@playwright/test";
import { SMOKE_ROUTES } from "../fixtures/routes.js";

/**
 * Smoke: every leaf screen in the nav registry is reachable and renders for a super-admin.
 * Runs authenticated (storageState from the `setup` project). Invariants per route:
 *   - not bounced to /login (session + guard OK),
 *   - the app shell is present (non-lockdown), or fully stripped (kiosk-lockdown scan station),
 *   - no unhandled render crash (React error boundary / blank body).
 *
 * This is the thin all-routes baseline; deep behavior lives in the per-module specs and the
 * docs/testing/test-cases/*.md catalog.
 */
test.describe("smoke — all routes render", () => {
  for (const route of SMOKE_ROUTES) {
    test(`${route.navKey} (${route.path})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("pageerror", (err) => consoleErrors.push(String(err)));

      await page.goto(route.path);

      // Guard/session OK — a leaf route for a super-admin must not redirect to login.
      await expect(page).not.toHaveURL(/\/login/);

      if (route.kioskLockdown) {
        // Scan station strips sidebar/topbar/tabbar/palette — no landmark navigation.
        await expect(page.getByRole("navigation")).toHaveCount(0);
      } else {
        // Authenticated shell renders its nav landmark (Sidebar is visible at desktop width).
        await expect(page.getByRole("navigation").first()).toBeVisible();
      }

      // Body rendered real content, not a blank/error shell.
      await expect(page.locator("#root")).not.toBeEmpty();
      expect(consoleErrors, `uncaught page errors on ${route.path}`).toEqual([]);
    });
  }
});
