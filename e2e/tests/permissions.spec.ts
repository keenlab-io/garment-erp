import { test, expect } from "@playwright/test";
import { PERSONAS, personaStatePath } from "../fixtures/personas.js";

/**
 * Reference permission-gating spec — the copy-me pattern for the TC-XC cases in
 * docs/testing/test-cases/00-cross-cutting.md.
 *
 * Each persona is a REAL logged-in user created by `SEED_TEST_DATA=1 pnpm db:seed`; `tests/auth.setup.ts` saves one
 * storage state per persona and a describe block opts in with
 * `test.use({ storageState: personaStatePath(...) })`, overriding the `app` project's super-admin
 * default. To add a persona's cases, copy a block and swap the persona.
 *
 * The invariant under test is **absent, not disabled** (UI_TEST_PLAN §4): an unpermitted module is
 * not in the DOM at all, and typing its URL redirects to the dashboard (`router/guards.ts`).
 */

const MODULE_NAV = ["Inventory", "Production", "Sales", "HR & Payroll", "Reports", "Admin & Access"];

/** Assert exactly the expected top-level modules are present, and every other one is absent. */
async function expectModules(page: import("@playwright/test").Page, expected: string[]) {
  for (const label of MODULE_NAV) {
    const nav = page.getByRole("button", { name: label, exact: true });
    if (expected.includes(label)) await expect(nav).toBeVisible();
    else await expect(nav).toHaveCount(0);
  }
}

test.describe("cross-cutting — permission gating (reference)", () => {
  test.describe("Reports Viewer", () => {
    test.use({ storageState: personaStatePath(PERSONAS.reportsViewer!) });

    test("TC-XC-PERM-01 sees only Reports in nav; every other module is absent", async ({ page }) => {
      await page.goto("/");
      await expectModules(page, ["Reports"]);
    });

    test("TC-XC-PERM-02 a gated URL typed directly redirects to the dashboard", async ({ page }) => {
      await page.goto("/admin/users");
      await expect(page).toHaveURL(/\/$/);
      await expectModules(page, ["Reports"]);
    });
  });

  test.describe("Inventory Operator", () => {
    test.use({ storageState: personaStatePath(PERSONAS.inventoryOperator!) });

    test("TC-XC-PERM-03 sees Inventory only — no Reports despite inventory permissions", async ({
      page,
    }) => {
      await page.goto("/");
      await expectModules(page, ["Inventory"]);
    });
  });

  test.describe("No permissions", () => {
    test.use({ storageState: personaStatePath(PERSONAS.none!) });

    test("TC-XC-PERM-04 a valid login with zero roles sees no gated module at all", async ({
      page,
    }) => {
      await page.goto("/");
      // Signed in — not bounced to /login. The dashboard itself is ungated.
      await expect(page).toHaveURL(/\/$/);
      await expectModules(page, []);
    });
  });
});
