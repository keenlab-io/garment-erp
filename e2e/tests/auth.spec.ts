import { test, expect } from "@playwright/test";
import { SUPERADMIN_CREDENTIALS } from "../fixtures/personas.js";
import { forceEnglishLightState } from "../fixtures/auth.js";

/**
 * Cross-cutting auth — TC-XC-01..05 of docs/testing/test-cases/00-cross-cutting.md.
 *
 * These run UNAUTHENTICATED: the `app` project ships super-admin storage state, which would skip
 * the login screen entirely, so the whole file overrides it with an empty state.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("cross-cutting — login and session (TC-XC)", () => {
  test.beforeEach(async ({ page }) => {
    await forceEnglishLightState(page);
  });

  test("TC-XC-01 login succeeds with the seeded super-admin and lands on /", async ({ page }) => {
    await page.goto("/login");
    const username = page.getByRole("textbox", { name: "Username" });
    // The catalog claims password inputs are not role=textbox; they are here, and `getByLabel`
    // is ambiguous because the "Show password" toggle shares the label.
    const password = page.getByRole("textbox", { name: "Password" });
    const submit = page.getByRole("button", { name: "Sign in" });

    // Guarded while either field is empty.
    await expect(submit).toBeDisabled();
    await username.fill(SUPERADMIN_CREDENTIALS.username);
    await expect(submit).toBeDisabled();

    await password.fill(SUPERADMIN_CREDENTIALS.password);
    await submit.click();

    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await expect(page).toHaveURL(/\/$/);
    // Landed inside the shell, not on a bare page.
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByText("Incorrect username or password.")).toHaveCount(0);
  });

  test("TC-XC-02 login failure shows the danger badge and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Username" }).fill(SUPERADMIN_CREDENTIALS.username);
    await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Incorrect username or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    // The typed username survives, and the form is usable again.
    await expect(page.getByRole("textbox", { name: "Username" })).toHaveValue(
      SUPERADMIN_CREDENTIALS.username,
    );
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  test("TC-XC-03 ?notice=reauth shows the re-auth banner, and an unknown notice shows none", async ({
    page,
  }) => {
    await page.goto("/login?notice=reauth");
    await expect(page.getByText("Your access changed. Please sign in again.")).toBeVisible();

    // Search-param validation strips unknown values rather than rendering them.
    await page.goto("/login?notice=bogus");
    await expect(page.getByText("Your access changed. Please sign in again.")).toHaveCount(0);
    await expect(page.getByText("Your session expired. Please sign in again.")).toHaveCount(0);
  });

  test("TC-XC-04 ?notice=session-expired shows the expiry banner", async ({ page }) => {
    await page.goto("/login?notice=session-expired");
    await expect(page.getByText("Your session expired. Please sign in again.")).toBeVisible();
  });

  test("TC-XC-05 session restores on reload with no /login flash", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Username" }).fill(SUPERADMIN_CREDENTIALS.username);
    await page.getByRole("textbox", { name: "Password" }).fill(SUPERADMIN_CREDENTIALS.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));

    // Record every navigation across the reload: a /login paint is the bug this case exists for.
    const visited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) visited.push(frame.url());
    });

    await page.reload();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    expect(visited.some((u) => u.includes("/login"))).toBe(false);
    expect(page.url()).not.toContain("/login");
  });
});
