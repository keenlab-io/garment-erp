import { test, expect, type Page } from "@playwright/test";
import { PERSONAS, personaStatePath } from "../fixtures/personas.js";

/**
 * Permission gating — TC-XC-06..10 of docs/testing/test-cases/00-cross-cutting.md.
 *
 * Each persona is a REAL logged-in user created by `SEED_TEST_DATA=1 pnpm db:seed`;
 * `tests/auth.setup.ts` saves one storage state per persona and a describe block opts in with
 * `test.use({ storageState: personaStatePath(...) })`, overriding the `app` project's super-admin
 * default. To add a persona's cases, copy a block and swap the persona.
 *
 * The invariant under test is **absent, not disabled**: an unpermitted module is not in the DOM at
 * all, and typing its URL redirects to the dashboard (`router/guards.ts`).
 */

const MODULE_NAV = ["Inventory", "Production", "Sales", "HR & Payroll", "Reports", "Admin & Access"];

/** Assert exactly the expected top-level modules are present, and every other one is absent. */
async function expectModules(page: Page, expected: string[]) {
  for (const label of MODULE_NAV) {
    const nav = page.getByRole("button", { name: label, exact: true });
    if (expected.includes(label)) await expect(nav).toBeVisible();
    else await expect(nav).toHaveCount(0);
  }
}

test.describe("cross-cutting — permission gating (TC-XC)", () => {
  test.describe("No permissions", () => {
    test.use({ storageState: personaStatePath(PERSONAS.none!) });

    test("TC-XC-06 a valid login with zero roles sees no module anywhere", async ({ page }) => {
      await page.goto("/");
      // Signed in — not bounced to /login. The dashboard itself is ungated.
      await expect(page).toHaveURL(/\/$/);
      await expectModules(page, []);

      // …and the palette offers nothing either: it reads the same filtered registry.
      await page.keyboard.press("Control+k");
      await expect(page.locator("[cmdk-root]")).toBeVisible();
      for (const label of MODULE_NAV) {
        await expect(page.getByRole("option", { name: new RegExp(label, "i") })).toHaveCount(0);
      }
    });
  });

  test.describe("Reports Viewer", () => {
    test.use({ storageState: personaStatePath(PERSONAS.reportsViewer!) });

    test("TC-XC-07 a single-module persona sees only that module in nav and palette", async ({
      page,
    }) => {
      await page.goto("/");
      await expectModules(page, ["Reports"]);

      await page.keyboard.press("Control+k");
      await expect(page.locator("[cmdk-root]")).toBeVisible();
      await expect(page.getByRole("option", { name: /admin/i })).toHaveCount(0);
      await expect(page.getByRole("option", { name: /payroll/i })).toHaveCount(0);
    });

    test("TC-XC-08 a gated URL typed directly redirects to the dashboard", async ({ page }) => {
      await page.goto("/admin/users");
      await expect(page).toHaveURL(/\/$/);
      await expectModules(page, ["Reports"]);
    });
  });

  test.describe("Inventory Operator", () => {
    test.use({ storageState: personaStatePath(PERSONAS.inventoryOperator!) });

    test("TC-XC-10 a module root redirects to the first child the persona can reach", async ({
      page,
    }) => {
      // The operator holds product/receipt/issue rights but no cost or adjustment-approve ones,
      // so the landing child must be one they may actually open.
      await page.goto("/inventory");
      await expect(page).toHaveURL(/\/inventory\/\w+/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });

  test.describe("Super admin", () => {
    test("TC-XC-09 super-admin bypasses every gate and Admin is bottom-anchored", async ({
      page,
    }) => {
      await page.goto("/");
      await expectModules(page, MODULE_NAV);

      // Admin & Access is its own bottom-anchored group, after every other module.
      const mainNav = page.getByRole("navigation", { name: "Main navigation" });
      const adminNav = page.getByRole("navigation", { name: "Admin navigation" });
      await expect(adminNav.getByRole("button", { name: "Admin & Access" })).toBeVisible();
      await expect(mainNav.getByRole("button", { name: "Admin & Access" })).toHaveCount(0);

      // Every gated route loads without a redirect.
      for (const path of ["/admin/users", "/hr/payroll", "/inventory/adjustments"]) {
        await page.goto(path);
        // Wait for the screen before reading the URL: a guard redirect lands after navigation,
        // so asserting the URL first races it and passes for the wrong reason.
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(page.url()).toContain(path);
      }
    });
  });
});
