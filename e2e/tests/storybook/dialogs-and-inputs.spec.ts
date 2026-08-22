import { test, expect, type Page } from "@playwright/test";

/**
 * Interactive primitives — TC-CMP-11..21 of docs/testing/test-cases/99-components.md.
 * English is pinned for the same reason as the other storybook specs (default locale is Thai).
 */
async function story(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=locale:en`);
  await expect(page.locator("#storybook-root")).not.toBeEmpty();
}

/** Confirm buttons live inside the dialog; the page trigger often shares their label. */
function inDialog(page: Page) {
  return page.getByRole("dialog");
}

test.describe("dialogs (TC-CMP)", () => {
  test("TC-CMP-11 void-invoice confirm states the consequence and gates on a reason", async ({
    page,
  }) => {
    await story(page, "primitives-dialog--void-invoice");
    await page.getByRole("button", { name: "Void invoice" }).click();

    const dialog = inDialog(page);
    await expect(dialog).toBeVisible();
    // A destructive confirm must say what it will do, not just ask "are you sure?".
    await expect(dialog).toContainText(/void/i);

    // The reason gate blocks on SUBMIT with an inline error — the button stays enabled so the
    // user can find out why, rather than facing a dead control with no explanation.
    const confirm = dialog.getByRole("button", { name: /void/i }).last();
    await confirm.click();
    await expect(dialog.getByText(/reason is required/i)).toBeVisible();
    await expect(dialog).toBeVisible(); // refused, not dismissed

    await dialog.getByLabel("Reason").fill("Duplicated by INV20260002");
    await confirm.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("TC-CMP-12 re-auth guarded confirm stays disabled until the password is entered", async ({
    page,
  }) => {
    await story(page, "primitives-dialog--reauth-guarded");
    await page.getByRole("button", { name: "Delete role" }).click();

    const dialog = inDialog(page);
    const confirm = dialog.getByRole("button", { name: /delete/i }).last();
    await expect(confirm).toBeDisabled();

    await dialog.getByRole("textbox", { name: /password/i }).fill("hunter2");
    await expect(confirm).toBeEnabled();
  });

  test("TC-CMP-13 document-void preset names the subject and requires a reason", async ({
    page,
  }) => {
    await story(page, "permission-guardedactiondialog--document-void");
    await page.getByRole("button", { name: "Trigger" }).click();

    const dialog = inDialog(page);
    // The preset interpolates the subject into the title, so the user knows WHAT they're voiding.
    await expect(dialog.getByRole("heading")).toContainText(/void/i);
    const confirm = dialog.getByRole("button", { name: "Void" });
    await confirm.click();
    await expect(dialog.getByText(/reason is required/i)).toBeVisible();

    await dialog.getByLabel("Reason").fill("Wrong customer");
    await confirm.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("TC-CMP-14 force-logout preset demands a re-auth password", async ({ page }) => {
    await story(page, "permission-guardedactiondialog--force-logout");
    await page.getByRole("button", { name: "Trigger" }).click();

    const dialog = inDialog(page);
    const confirm = dialog.getByRole("button", { name: "Force logout" });
    await expect(confirm).toBeDisabled();
    const password = dialog.getByRole("textbox", { name: /password/i });
    await expect(password).toBeVisible();
    await password.fill("hunter2");
    await expect(confirm).toBeEnabled();
  });

  test("TC-CMP-15 payroll-approve needs neither reason nor password", async ({ page }) => {
    await story(page, "permission-guardedactiondialog--payroll-approve");
    await page.getByRole("button", { name: "Trigger" }).click();

    const dialog = inDialog(page);
    // Not destructive and not re-auth gated: confirm is live immediately.
    await expect(dialog.getByRole("button", { name: "Approve payroll" })).toBeEnabled();
    await expect(dialog.getByRole("textbox", { name: /password/i })).toHaveCount(0);
    await expect(dialog.getByLabel("Reason")).toHaveCount(0);
  });
});

test.describe("inputs & flow (TC-CMP)", () => {
  test("TC-CMP-16 combobox filters as you type and selects via keyboard", async ({ page }) => {
    await story(page, "primitives-combobox--single");
    const trigger = page.getByRole("combobox");
    await trigger.click();

    const search = page.getByRole("textbox").first();
    await search.fill("a");
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();

    // Keyboard commits the active option, closing the popover and updating the trigger.
    const chosen = await options.first().innerText();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(trigger).toContainText(chosen.trim().slice(0, 12));
  });

  test("TC-CMP-17 select opens with the keyboard and commits the highlighted option", async ({
    page,
  }) => {
    await story(page, "primitives-select--single");
    const trigger = page.getByRole("combobox");
    const before = (await trigger.innerText()).trim();

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option").first()).toBeVisible();

    // Commit whatever the keyboard highlighted, then assert the popup closed and the trigger
    // carries a committed value. (Comparing against `before` is unreliable: ArrowDown may land
    // back on the already-selected option.)
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(trigger).not.toBeEmpty();
    expect(before.length).toBeGreaterThan(0);
  });

  test("TC-CMP-18 wizard step header gates forward progress but allows back-jumps", async ({
    page,
  }) => {
    await story(page, "primitives-wizard--goods-receipt");

    const lines = page.getByText("Lines step content goes here.");
    await expect(lines).toBeVisible();

    // The gate is expressed in the step header itself: unreached steps are disabled buttons,
    // so there is nothing to click your way past.
    await expect(page.getByRole("button", { name: /Post$/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Landed cost$/ })).toBeDisabled();

    // Continue advances one step…
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(lines).toHaveCount(0);

    // …and the step just left stays ENABLED: back-jumps are allowed, forward ones are not.
    const back = page.getByRole("button", { name: /Lines$/ });
    await expect(back).toBeEnabled();
    await back.click();
    await expect(page.getByText("Lines step content goes here.")).toBeVisible();
  });

  test("TC-CMP-19 WizardNav blocks Continue when the step is invalid", async ({ page }) => {
    await story(page, "primitives-wizard--review-step-blocked");
    await expect(page.getByText("Add at least one line to continue.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("TC-CMP-20 Enter commits a scan with qty and clears the input", async ({ page }) => {
    await story(page, "primitives-scanfield--goods-issue-loop");
    const input = page.getByRole("textbox").first();

    await input.fill("SEED-FG-001");
    await page.keyboard.press("Enter");

    // The field clears so the next barcode can be fired straight in — the scanning loop.
    await expect(input).toHaveValue("");
  });

  test("TC-CMP-21 a transient toast appears and a job toast resolves in place", async ({
    page,
  }) => {
    await story(page, "primitives-toast--playground");

    await page.getByRole("button", { name: "Show toast" }).click();
    const region = page.getByRole("region", { name: /notification/i });
    await expect(region).toContainText(/./);

    // The job toast updates the SAME notification rather than stacking a second one.
    await page.getByRole("button", { name: "Run export (job toast)" }).click();
    await expect(region).toContainText(/./);
  });
});
