import { test, expect, type Page } from "@playwright/test";
import { PERSONAS, SUPERADMIN_CREDENTIALS, personaStatePath } from "../fixtures/personas.js";

/**
 * Admin & Access — TC-ADMIN-01..09 of docs/testing/test-cases/06-admin.md.
 *
 * There is NO delete-user endpoint, so every run creates users that persist. Names carry a run
 * suffix rather than colliding, and the specs never assume an empty list.
 */
test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString().slice(-6);
const USERNAME = `hr.clerk.${RUN}`;
const ROLE_NAME = `HR Clerk ${RUN}`;

/** The role the created user is given — any seeded persona role works. */
const EXISTING_ROLE = "HR Officer";

async function gotoAdmin(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("admin — users, roles, audit (TC-ADMIN)", () => {
  test("TC-ADMIN-01 the Admin module loads and the users list renders", async ({ page }) => {
    await page.goto("/");
    // Admin & Access is bottom-anchored in its own landmark, below the module list.
    await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("button", { name: "Admin & Access" }).click();
    await page.getByRole("link", { name: "Users" }).click();

    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();

    // The seeded super-admin is always present, with a status chip.
    const row = page.getByRole("row").filter({ hasText: "superadmin" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Active");

    await expect(page.getByRole("button", { name: "Create user" })).toBeVisible();
  });

  test("TC-ADMIN-02 create a user, assign roles, then disable and re-enable", async ({ page }) => {
    await gotoAdmin(page, "/admin/users");
    await page.getByRole("button", { name: "Create user" }).click();

    // The drawer's submit shares its name with the header button and the toast — scope to it.
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Username").fill(USERNAME);
    await drawer.getByLabel("Email").fill(`${USERNAME}@example.com`);
    await drawer.getByLabel("Temporary password").fill("Temp#12345");
    await drawer.getByRole("combobox", { name: "Roles" }).click();
    await page.getByRole("option", { name: EXISTING_ROLE }).click();
    await page.keyboard.press("Escape");
    await drawer.getByRole("button", { name: "Create user" }).click();

    const row = page.getByRole("row").filter({ hasText: USERNAME });
    await expect(row).toBeVisible();

    // ---- detail: roles and status are separately saved sections ----
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "View details" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(USERNAME);

    // Account status is a Radix Select (a button), not a native <select> — selectOption does
    // nothing here.
    await page.getByRole("combobox", { name: "Account status" }).click();
    await page.getByRole("option", { name: "Disabled" }).click();

    const disabled = page.waitForResponse(
      (r) => r.url().includes("/status") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save status" }).click();
    expect((await disabled).status()).toBeLessThan(400);

    // Put it back so a re-run of this serial file starts from a usable account. Wait for the
    // control to settle first — it is disabled while the save is in flight, so an immediate
    // click lands on a dead element.
    await expect(page.getByRole("button", { name: "Save status" })).toBeEnabled();
    await expect(page.getByRole("combobox", { name: "Account status" })).toBeEnabled();
    await page.getByRole("combobox", { name: "Account status" }).click();
    await page.getByRole("option", { name: "Active" }).click();
    const reenabled = page.waitForResponse(
      (r) => r.url().includes("/status") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save status" }).click();
    expect((await reenabled).status()).toBeLessThan(400);
  });

  test("TC-ADMIN-04 force-logout is guarded by a password field that gates confirm", async ({
    page,
  }) => {
    await gotoAdmin(page, "/admin/users");
    await page.getByRole("row").filter({ hasText: USERNAME }).getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "View details" }).click();

    await page.getByRole("button", { name: "Force logout" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(USERNAME);
    // The consequence is stated, not just "are you sure?".
    await expect(dialog).toContainText(/revokes every active session/i);

    const confirm = dialog.getByRole("button", { name: "Force logout" });
    await expect(confirm).toBeDisabled();

    // NOTE: here the password is a UI gate ONLY. `handleForceLogout` ignores the dialog's
    // ConfirmResult and `forceLogout` is contracted `c.noBody()`, so nothing is transmitted or
    // verified — a wrong password succeeds. Role delete (TC-ADMIN-07) does it properly, sending
    // `super_admin_password` and re-authenticating server-side, which is what makes this an
    // inconsistency rather than a design choice. Asserting a rejection here would encode a
    // guarantee the system does not make.
    await dialog.getByRole("textbox", { name: /password/i }).fill("not-the-real-password");
    await expect(confirm).toBeEnabled();

    const revoked = page.waitForResponse(
      (r) => r.url().includes("/force-logout") && r.request().method() === "POST",
    );
    await confirm.click();
    expect((await revoked).status()).toBeLessThan(400); // succeeds despite the wrong password
  });

  test("TC-ADMIN-05 create a role from the permission matrix, then clone it", async ({ page }) => {
    await gotoAdmin(page, "/admin/roles");
    await expect(page.getByRole("heading", { level: 1, name: "Roles" })).toBeVisible();

    await page.getByRole("button", { name: "Create role" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Name").fill(ROLE_NAME);

    // Matrix checkboxes are labelled by their permission code — the stable hook.
    for (const code of ["hr.employee.view", "hr.employee.manage", "hr.ot.approve"]) {
      await drawer.getByRole("checkbox", { name: code }).click();
    }
    await drawer.getByRole("button", { name: "Create role" }).click();

    const row = page.getByRole("row").filter({ hasText: ROLE_NAME });
    await expect(row).toBeVisible();
    await expect(row).toContainText("3"); // three permissions granted

    // Clone carries the permission set to a new role.
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "Clone" }).click();
    const cloneDialog = page.getByRole("dialog");
    await cloneDialog.getByRole("button", { name: "Clone role" }).click();
    await expect(page).toHaveURL(/\/admin\/roles\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/copy/i);
  });
});

test.describe("admin — permission gate (TC-ADMIN)", () => {
  test.describe("Reports Viewer", () => {
    test.use({ storageState: personaStatePath(PERSONAS.reportsViewer!) });

    test("TC-ADMIN-03 a non-super-admin cannot see or reach Admin", async ({ page }) => {
      await page.goto("/");
      // Wait for the shell: the palette keymap is a window listener registered on mount.
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      // superAdminOnly modules are stripped by filterNav — absent, not disabled.
      await expect(page.getByRole("button", { name: "Admin & Access" })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Admin navigation" })).toHaveCount(0);

      await page.keyboard.press("Control+k");
      await expect(page.locator("[cmdk-root]")).toBeVisible();
      await page.locator("[cmdk-input]").fill("roles");
      await expect(page.getByRole("option", { name: /roles/i })).toHaveCount(0);
      await page.keyboard.press("Escape");

      for (const path of ["/admin/users", "/admin/roles", "/admin/import"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(page.url()).not.toContain("/admin");
      }
    });
  });
});

test.describe("admin — matrix, delete, audit, import (TC-ADMIN)", () => {
  test.describe.configure({ mode: "serial" });

  test("TC-ADMIN-06 role matrix edits are dirty-tracked and persist", async ({ page }) => {
    await gotoAdmin(page, "/admin/roles");
    // Exact cell match: the clone from TC-ADMIN-05 is "<name> copy", so a hasText filter on the
    // name alone matches two rows.
    const roleRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("gridcell", { name: ROLE_NAME, exact: true }) });
    await roleRow.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(ROLE_NAME);

    // Dirty tracking: nothing to save until something changes.
    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();

    await page.getByRole("checkbox", { name: "sales.quotation.manage" }).click();
    await expect(save).toBeEnabled();

    const saved = page.waitForResponse(
      (r) => /\/roles\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname) && r.request().method() === "PUT",
    );
    await save.click();
    // The save is guarded: it force re-authenticates everyone holding the role.
    const confirm = page.getByRole("dialog").getByRole("button", { name: /save|confirm/i }).last();
    await confirm.click();
    expect((await saved).status()).toBeLessThan(400);

    // Persisted, not just optimistic.
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "sales.quotation.manage" })).toBeChecked();
  });

  test("TC-ADMIN-07 role delete is password-gated, and a role in use is refused", async ({
    page,
  }) => {
    await gotoAdmin(page, "/admin/roles");

    // The clone from TC-ADMIN-05 holds no users, so it is deletable.
    const copyRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("gridcell", { name: `${ROLE_NAME} copy`, exact: true }) });

    async function openDelete(row: typeof copyRow) {
      await row.getByRole("button", { name: "Row actions" }).click();
      await page.getByRole("button", { name: "Delete" }).click();
      return page.getByRole("dialog");
    }

    // ---- wrong password is refused, and nothing is deleted --------------------------------
    // Unlike force-logout, role delete VERIFIES server-side: `deleteRole` carries
    // `super_admin_password` and `RoleService.delete` re-authenticates before any read or write.
    let dialog = await openDelete(copyRow);
    await expect(dialog).toContainText(`${ROLE_NAME} copy`);
    const confirm = dialog.getByRole("button", { name: "Delete role" });
    await expect(confirm).toBeDisabled();

    await dialog.getByRole("textbox", { name: /password/i }).fill("not-the-real-password");
    await expect(confirm).toBeEnabled();
    const rejected = page.waitForResponse(
      (r) => r.url().includes("/roles/") && r.request().method() === "DELETE",
    );
    await confirm.click();
    expect((await rejected).status()).toBe(403);

    // Re-load before re-asserting: the dialog's state after a rejected confirm is not part of
    // any contract, and depending on the list's in-place re-render would be flaky for the
    // wrong reason. What matters is that the role SURVIVED the bad attempt.
    await page.keyboard.press("Escape");
    await gotoAdmin(page, "/admin/roles");
    await expect(copyRow).toBeVisible();

    // ---- the real password goes through ----------------------------------------------------
    dialog = await openDelete(copyRow);
    await dialog.getByRole("textbox", { name: /password/i }).fill(SUPERADMIN_CREDENTIALS.password);
    const deleted = page.waitForResponse(
      (r) => r.url().includes("/roles/") && r.request().method() === "DELETE",
    );
    await dialog.getByRole("button", { name: "Delete role" }).click();
    expect((await deleted).status()).toBeLessThan(400);
    await expect(copyRow).toHaveCount(0);

    // ---- a role bound to a user is refused with 409, not orphaned --------------------------
    const inUse = page
      .getByRole("row")
      .filter({ has: page.getByRole("gridcell", { name: EXISTING_ROLE, exact: true }) });
    const blocked = await openDelete(inUse);
    await blocked
      .getByRole("textbox", { name: /password/i })
      .fill(SUPERADMIN_CREDENTIALS.password);
    const refused = page.waitForResponse(
      (r) => r.url().includes("/roles/") && r.request().method() === "DELETE",
    );
    await blocked.getByRole("button", { name: "Delete role" }).click();
    expect((await refused).status()).toBe(409);
    await page.keyboard.press("Escape");
    await expect(inUse).toBeVisible(); // still there
  });

  test("TC-ADMIN-08 audit log filters, expands a diff, and reports an empty match", async ({
    page,
  }) => {
    await gotoAdmin(page, "/admin/audit");
    await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();

    // This run has just created a role and a user, so there is something to find.
    await page.getByLabel("Entity type").fill("role");
    await expect(page.getByRole("row").nth(1)).toBeVisible();

    // Rows are immutable: the only per-row control is the diff toggle.
    const show = page.getByRole("button", { name: "Show details" }).first();
    await show.click();
    await expect(page.getByText("After", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Hide details" }).first().click();

    // A future From-date can match nothing, and the empty state says so.
    await page.getByLabel("From").fill("2999-01-01");
    await expect(page.getByText("No audit entries match these filters.")).toBeVisible();
  });

  test("TC-ADMIN-09 permission import validates a bad file before committing anything", async ({
    page,
  }) => {
    await gotoAdmin(page, "/admin/import");
    await expect(page.getByRole("heading", { level: 1, name: "Permission import" })).toBeVisible();
    await expect(page.getByText("Upload a file to see the validation review.")).toBeVisible();

    // An unknown permission code fails the WHOLE import — nothing is created.
    const bad = page.waitForResponse((r) => r.url().includes("/import") && r.request().method() === "POST");
    await page.locator('input[type="file"]').setInputFiles({
      name: "roles-bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`Imported Role ${RUN},not.a.real.permission\n`),
    });
    expect((await bad).status()).toBeLessThan(500); // a validation answer, not a crash
    await expect(page.getByText(/error/i).first()).toBeVisible();

    // The role must NOT exist — the import is atomic.
    await gotoAdmin(page, "/admin/roles");
    await expect(page.getByRole("row").filter({ hasText: `Imported Role ${RUN}` })).toHaveCount(0);
  });
});
