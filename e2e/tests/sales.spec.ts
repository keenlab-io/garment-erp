import { test, expect, type Page } from "@playwright/test";

/**
 * Reference module spec — Sales documents. This is the copy-me pattern for the other module
 * golden paths (see docs/testing/test-cases/03-sales.md for the full catalog). Runs authenticated
 * as super-admin (storageState from the `setup` project), English + light theme.
 *
 * SEED DATA: `SEED_TEST_DATA=1 pnpm db:seed` creates the customer (`Acme Garments Co., Ltd.`) and items
 * (`SEED-FAB-001`, `SEED-FG-001`) this spec selects. If TC-SALES-04 fails at the customer or item
 * picker, the seed has not been run — that is the fix, not a looser selector.
 *
 * NO RELOADS mid-lifecycle: a created document lives in a per-session client store
 * (apps/web/src/sales/document-store.ts), not a server list — the contract has no
 * get-document-by-id endpoint. `page.reload()` between transitions would drop the record and the
 * screen would render as an empty "new document". Navigate by clicking, never by re-goto.
 */

/** The lifecycle chip sits next to the h1 (doc no) in the editor header — see document-editor.tsx. */
function statusChip(page: Page) {
  return page.getByRole("heading", { level: 1 }).locator("xpath=following-sibling::span").first();
}

/**
 * Assert the editor's lifecycle chip reads `label`. Anchored at the END of the text because
 * `InkChip` prefixes a status glyph swatch (`◇Draft`, `▣Issued`) — the glyph is `aria-hidden` but
 * still part of the node's text content.
 */
async function expectStatus(page: Page, label: string) {
  await expect(statusChip(page)).toHaveText(new RegExp(`${label}$`));
}

test.describe("sales — documents worklist & editor (reference)", () => {
  test("TC-SALES-01/02 worklist renders and opens the document editor", async ({ page }) => {
    await page.goto("/sales/documents");

    // Worklist smoke: title + primary action.
    await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();
    const newDocBtn = page.getByRole("button", { name: "New document" });
    await expect(newDocBtn).toBeVisible();

    // Open the editor for a brand-new document.
    await newDocBtn.click();
    await expect(page).toHaveURL(/\/sales\/documents\/new\/edit/);
    await expect(page.getByRole("heading", { level: 1, name: "New document" })).toBeVisible();

    // Editor structure is present: document-type select + the create action, which stays DISABLED
    // until a customer and a valid line exist (a real, data-independent guard assertion).
    await expect(page.getByLabel("Document type")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create quotation" })).toBeDisabled();
  });

  test("TC-SALES-04 quotation → invoice lifecycle", async ({ page }) => {
    await page.goto("/sales/documents/new/edit");
    await expect(page.getByRole("heading", { level: 1, name: "New document" })).toBeVisible();

    // --- 1. Compose the quotation (customer + one item line) -------------------------------
    await page.getByRole("combobox", { name: "Customer" }).click();
    await page.getByRole("option", { name: /Acme Garments/ }).click();

    // Picking the customer fills their tax id/address read-only underneath (error prevention,
    // design MD3) — proving the autocomplete did more than set a hidden id. Scoped to the <dd> of
    // that panel: the same tax id also renders in the combobox trigger and the paper preview.
    await expect(page.getByRole("definition").filter({ hasText: "0105556000000" })).toBeVisible();

    await page.getByRole("combobox", { name: "Item" }).click();
    await page.getByRole("option", { name: /SEED-FG-001/ }).click();
    await page.getByLabel("Description").fill("Polo Shirt — Navy");
    await page.getByLabel("Qty").fill("10");
    await page.getByLabel("Unit price").fill("250");

    // The create action un-disables only once customer + a valid line both exist.
    const createBtn = page.getByRole("button", { name: "Create quotation" });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // --- 2. DRAFT: created, numbered, and on its own route ----------------------------------
    await expect(page).toHaveURL(/\/sales\/documents\/[0-9a-f-]{36}\/edit/);
    await expectStatus(page, "Draft");
    // The doc no comes from SequenceService (QV<year>0001 etc.) — assert the shape, not a value
    // that changes every run.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^QV|^QNV/);

    // --- 3. DRAFT → SENT → APPROVED --------------------------------------------------------
    await page.getByRole("button", { name: "Send" }).click();
    await expectStatus(page, "Sent");

    await page.getByRole("button", { name: "Approve" }).click();
    await expectStatus(page, "Approved");

    // --- 4. APPROVED → converted to a DRAFT invoice (new id, new route) ---------------------
    await page.getByRole("button", { name: "Convert to invoice" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^INV/);
    await expectStatus(page, "Draft");

    // --- 5. Issue the invoice → PromptPay QR appears ----------------------------------------
    await page.getByRole("button", { name: "Issue" }).click();
    await expectStatus(page, "Issued");
    await expect(page.getByText("PromptPay", { exact: true })).toBeVisible();

    // --- 6. Record full payment → PAID ------------------------------------------------------
    // Click through rather than goto: the payments screen reads the same session store.
    await page.getByRole("link", { name: "Go to payments" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();

    // Select the invoice we just issued from the session list.
    await page.getByRole("button", { name: /^INV/ }).click();

    // Pay exactly the outstanding balance. Read it off the screen rather than recomputing VAT
    // here — the app's own total is what the payment must clear.
    const outstandingText = await page
      .getByText("Outstanding", { exact: true })
      .locator("xpath=following-sibling::dd")
      .innerText();
    const outstanding = outstandingText.replace(/[^0-9.]/g, "");
    expect(Number(outstanding)).toBeGreaterThan(0);

    await page.getByLabel("Amount").fill(outstanding);
    await page.getByRole("button", { name: "Record payment" }).click();

    // Fully paid → the chip flips to Paid and a receipt is issued.
    await expect(page.getByText(/Paid$/).first()).toBeVisible();
  });
});
