import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * UI login helper. Selectors are LOCALE-INDEPENDENT (the app defaults to Thai): the login form uses
 * `autocomplete` + input `type` + `type=submit`, which don't change with language.
 * See apps/web/src/router/routes/login.tsx.
 */
export async function login(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.locator('input[autocomplete="username"]').fill(credentials.username);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.locator('button[type="submit"]').click();
  // On success the app navigates to `/` once the session propagates (login.tsx effect).
  await expect(page).toHaveURL(/\/$|\/#|\/dashboard|\//, { timeout: 15_000 });
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/**
 * Force the app into a deterministic English + light-theme state for stable, readable assertions.
 * Call inside a context BEFORE the app reads localStorage (i.e. via addInitScript or right after a
 * fresh goto + reload). These are the real storage keys from apps/web (i18n.ts / resolve-theme.ts).
 */
export async function forceEnglishLightState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("erp.locale", "en");
      window.localStorage.setItem("erp.theme", "light");
    } catch {
      /* private mode — ignore */
    }
  });
}
