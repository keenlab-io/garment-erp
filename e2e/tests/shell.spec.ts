import { test, expect, type Page } from "@playwright/test";

/**
 * App shell cross-cutting cases — TC-XC-11..20 of docs/testing/test-cases/00-cross-cutting.md:
 * theme, density, locale, command palette, and kiosk lockdown.
 *
 * theme/density/locale live on `<html>` (not a shell wrapper) so Radix-portaled overlays inherit
 * them — every assertion here reads the root element.
 */

/**
 * Land on the dashboard with no persisted theme/density choice, in English.
 *
 * Cleared ONCE and then reloaded — deliberately not via `addInitScript`, which re-runs on every
 * navigation and would wipe the very preference the persistence cases are trying to observe.
 */
async function freshShell(page: Page) {
  await page.goto("/");
  // Let the session settle FIRST. `restoreSession()` exchanges the persisted refresh token for a
  // fresh pair and rotates it; reloading mid-flight leaves a spent token and lands on /login.
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.removeItem("erp.theme");
    window.localStorage.removeItem("erp.density");
    window.localStorage.setItem("erp.locale", "en");
  });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
}

const html = (page: Page) => page.locator("html");

test.describe("cross-cutting — shell (TC-XC)", () => {
  test("TC-XC-11 theme toggle flips data-theme and persists across reload", async ({ page }) => {
    await freshShell(page);
    await page.getByRole("button", { name: "Switch to dark" }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    // The control now offers the way back.
    await expect(page.getByRole("button", { name: "Switch to light" })).toBeVisible();

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("TC-XC-12 theme follows the OS until an explicit choice is made", async ({ page }) => {
    // No `prefers-color-scheme` rule exists in tokens.css — ThemeProvider reads matchMedia in JS.
    await page.emulateMedia({ colorScheme: "dark" });
    await freshShell(page);
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    // Still following: an OS flip moves the app live, with no reload.
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).toHaveAttribute("data-theme", "light");

    // An explicit choice ends the following.
    await page.getByRole("button", { name: "Switch to dark" }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("TC-XC-13 density toggle persists and is absent on kiosk routes", async ({ page }) => {
    await freshShell(page);
    const toggle = page.getByRole("button", { name: /Compact|Comfortable/ });
    await toggle.click();
    await expect(html(page)).toHaveAttribute("data-density", /compact|comfortable/);

    const afterFirst = await html(page).getAttribute("data-density");
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-density", afterFirst!);

    // Kiosk forces touch, and the control is not rendered at all — it cannot be overridden.
    await page.goto("/inventory/issues");
    await expect(html(page)).toHaveAttribute("data-density", "touch");
    await expect(page.getByRole("button", { name: /Compact|Comfortable/ })).toHaveCount(0);
  });

  test("TC-XC-14 locale toggle is live and sets <html lang>", async ({ page }) => {
    await freshShell(page);
    await expect(html(page)).toHaveAttribute("lang", "en");

    // The control names the language you'd switch TO.
    await page.getByRole("button", { name: "ภาษาไทย" }).click();
    await expect(html(page)).toHaveAttribute("lang", "th");
    await expect(page.getByRole("button", { name: "English" })).toBeVisible();

    await page.reload();
    await expect(html(page)).toHaveAttribute("lang", "th");
  });

  test("TC-XC-15 Ctrl-K toggles the palette and Esc closes it", async ({ page }) => {
    await freshShell(page);
    await page.keyboard.press("Control+k");
    await expect(page.locator("[cmdk-root]")).toBeVisible();

    // Ctrl-K toggles rather than only opening.
    await page.keyboard.press("Control+k");
    await expect(page.locator("[cmdk-root]")).toHaveCount(0);

    // Esc is left to cmdk's own Radix dialog, not the shell keymap.
    await page.keyboard.press("Control+k");
    await expect(page.locator("[cmdk-root]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[cmdk-root]")).toHaveCount(0);
  });

  test("TC-XC-16 '/' opens the palette only outside an editable field", async ({ page }) => {
    await freshShell(page);
    await page.locator("body").click();
    await page.keyboard.press("/");
    await expect(page.locator("[cmdk-root]")).toBeVisible();
    // The keystroke must not leak into the palette's own query.
    await expect(page.locator("[cmdk-input]")).toHaveValue("");
    await page.keyboard.press("Escape");

    // With focus in an input, "/" is just a character. Payroll's period field is a plain
    // textbox; the items list has no search input to borrow.
    await page.goto("/hr/payroll");
    const search = page.getByRole("textbox").first();
    await expect(search).toBeVisible();
    await search.click();
    await search.press("/");
    await expect(page.locator("[cmdk-root]")).toHaveCount(0);
    await expect(search).toHaveValue("/");
  });

  test("TC-XC-17 selecting a palette entry navigates and closes it", async ({ page }) => {
    await freshShell(page);
    await page.keyboard.press("Control+k");
    await page.locator("[cmdk-input]").fill("work");

    await page.getByRole("option", { name: /work order/i }).first().click();
    await expect(page).toHaveURL(/\/production\/work-orders/);
    await expect(page.locator("[cmdk-root]")).toHaveCount(0);
  });

  test("TC-XC-18 /inventory/issues auto-applies touch density, and leaving restores it", async ({
    page,
  }) => {
    await freshShell(page);
    await page.goto("/inventory/issues");
    await expect(html(page)).toHaveAttribute("data-density", "touch");

    await page.goto("/inventory/items");
    await expect(html(page)).not.toHaveAttribute("data-density", "touch");
  });

  test("TC-XC-19 /production/scan auto-applies touch density", async ({ page }) => {
    await freshShell(page);
    await page.goto("/production/scan");
    await expect(html(page)).toHaveAttribute("data-density", "touch");
  });

  test("TC-XC-20 kiosk lockdown on /production/scan strips the shell chrome", async ({ page }) => {
    await freshShell(page);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    // Kiosk is a lockdown: no nav to wander off with, no palette to escape through.
    await page.goto("/production/scan");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
  });
});
