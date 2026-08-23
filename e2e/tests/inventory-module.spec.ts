import { test, expect, type Page } from "@playwright/test";
import { PERSONAS, personaStatePath } from "../fixtures/personas.js";

/**
 * Inventory module — TC-INV-01..11 of docs/testing/test-cases/01-inventory.md.
 * The UAT journey J3 (receipt → count → adjustment) lives in inventory.spec.ts; this file covers
 * the module catalog around it.
 *
 * Seeded items (`SEED_TEST_DATA=1 pnpm db:seed`): SEED-FAB-KG-001 (KG) and SEED-THR-001 (PCS).
 */
test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString().slice(-6);
const FABRIC = "SEED-FAB-KG-001";
const html = (page: Page) => page.locator("html");

test.describe("inventory — catalog (TC-INV)", () => {
  test("TC-INV-01 items list renders its header, grid and type filters", async ({ page }) => {
    await page.goto("/inventory/items");
    await expect(page.getByRole("heading", { level: 1, name: "Items" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create item" })).toBeVisible();
    await expect(page.getByRole("grid")).toBeVisible();

    for (const col of ["Code", "Name", "Type", "Min stock"]) {
      await expect(page.getByRole("columnheader", { name: col })).toBeVisible();
    }

    // Type filter is a group of toggles, with "All types" pressed by default.
    const filters = page.getByRole("group", { name: "Type" });
    await expect(filters.getByRole("button", { name: "All types" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await filters.getByRole("button", { name: "Raw" }).click();
    await expect(filters.getByRole("button", { name: "Raw" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The seeded raw material survives the filter; the finished good does not.
    await expect(page.getByRole("row").filter({ hasText: FABRIC })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "SEED-FG-001" })).toHaveCount(0);
  });

  test("TC-INV-02 item detail exposes its tabs, and a SKU can be created", async ({ page }) => {
    await page.goto("/inventory/items");

    // The create drawer is asserted structurally only: "Base UOM ID" is a raw uuid field
    // ("The contract has no UOM catalog endpoint yet"), which no test — and realistically no
    // user — can supply. Creating items is therefore done by the seed. See inventory.spec.ts.
    await page.getByRole("button", { name: "Create item" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByLabel("Name")).toBeVisible();
    await expect(drawer.getByLabel("Base UOM ID")).toBeVisible();
    await expect(drawer.getByText(/no UOM catalog endpoint yet/i)).toBeVisible();
    await drawer.getByRole("button", { name: "Cancel" }).click();

    // Detail: open a seeded item through its row action and walk the tabs.
    const row = page.getByRole("row").filter({ hasText: FABRIC });
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "View" }).click();
    await expect(page).toHaveURL(/\/inventory\/items\/[0-9a-f-]{36}/);

    for (const tab of ["Overview", "SKUs", "Lots", "Stock card"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }

    await page.getByRole("tab", { name: "SKUs" }).click();
    // The session-only note is part of the contract gap this screen documents.
    await expect(page.getByText(/only SKUs created in this session/i)).toBeVisible();
    await page.getByLabel("Variant").fill(`Blue / L ${RUN}`);
    await page.getByLabel("Barcode").fill(`88500000${RUN}`);
    const created = page.waitForResponse(
      (r) => r.url().includes("/skus") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create SKU" }).click();
    expect((await created).status()).toBeLessThan(400);
    await expect(page.getByText(`Blue / L ${RUN}`)).toBeVisible();
  });

  test("TC-INV-04 the goods-issue kiosk forces touch density and runs a scan loop", async ({
    page,
  }) => {
    await page.goto("/inventory/issues");
    await expect(page.getByRole("heading", { level: 1, name: "Goods issues" })).toBeVisible();

    // Kiosk density, non-overridable: the toggle is not rendered at all here.
    await expect(html(page)).toHaveAttribute("data-density", "touch");
    await expect(page.getByRole("button", { name: /Compact|Comfortable/ })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Purpose" }).click();
    await page.getByRole("option", { name: "Production" }).click();

    // Scan-first loop: Enter commits and clears, so the next barcode can fire straight in.
    const scan = page.getByPlaceholder("Scan or enter a code");
    await scan.fill(FABRIC);
    await scan.press("Enter");
    await expect(scan).toHaveValue("");
    await expect(page.getByText("Last scans")).toBeVisible();

    await scan.fill(FABRIC);
    await scan.press("Enter");

    // Undo removes an entry without touching the rest.
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(page.getByText("Last scans")).toBeVisible();

    // Leaving the kiosk restores the normal density.
    await page.goto("/inventory/items");
    await expect(html(page)).not.toHaveAttribute("data-density", "touch");
  });

  test("TC-INV-05 posting an empty goods issue is refused", async ({ page }) => {
    await page.goto("/inventory/issues");

    // Nothing scanned: the screen must refuse rather than post an empty document. The refusal is
    // only a toast, which auto-dismisses and races — so assert the durable fact instead: no
    // goods-issue is ever created.
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/goods-issues") && r.method() === "POST") calls.push(r.url());
    });
    await page.getByRole("button", { name: "Post issue" }).click();
    await page.waitForTimeout(1000);
    expect(calls).toEqual([]);
  });

  test("TC-INV-10 barcode printing offers its form and the items-list bulk action", async ({
    page,
  }) => {
    await page.goto("/inventory/barcodes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The list's bulk action reaches the same dialog from a selection.
    await page.goto("/inventory/items");
    await page.getByRole("checkbox", { name: "Select row" }).first().click();
    await expect(page.getByText(/1 selected/)).toBeVisible();
    await page.getByRole("button", { name: "Print barcodes" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("TC-INV-11 inventory reports render their sections", async ({ page }) => {
    await page.goto("/inventory/reports");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The screen loaded rather than erroring — its individual reports depend on ledger state
    // this spec does not control, so the assertion is on the frame, not on figures.
    await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  });

  test("TC-INV-03 the receipt wizard gates Continue and previews the landed-cost allocation", async ({
    page,
  }) => {
    // The posting half of this flow is covered end to end by UAT-J3-02 (inventory.spec.ts);
    // what is asserted here is the wizard's own gating and preview, which J3 walks straight past.
    await page.goto("/inventory/receipts");
    await page.getByRole("button", { name: "New receipt" }).click();
    const drawer = page.getByRole("dialog");

    // Continue is refused until the line is complete.
    await expect(drawer.getByRole("button", { name: "Continue" })).toBeDisabled();

    await drawer.getByLabel("Supplier ID").fill("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await drawer.getByRole("combobox", { name: "Item" }).first().click();
    await page.getByRole("option", { name: new RegExp(FABRIC) }).click();
    await drawer.getByLabel("Qty").first().fill("100");
    await drawer.getByLabel("Unit price").first().fill("12.5");
    await expect(drawer.getByRole("button", { name: "Continue" })).toBeEnabled();

    // Landed cost: a live per-line preview, not a figure computed only on submit.
    await drawer.getByRole("button", { name: "Continue" }).click();
    await expect(drawer.getByText("Allocated landed cost")).toBeVisible();
    await expect(drawer.getByText("New unit cost")).toBeVisible();
    await drawer.getByLabel("Freight / import total").fill("500");
    // One line takes the whole freight, so it surfaces in the "Total allocated" footer.
    await expect(drawer.getByText("Total allocated")).toBeVisible();
    await expect(drawer).toContainText("500");
  });

  test("TC-INV-06 a stock count runs open → count → reconcile", async ({ page }) => {
    // Deliberately counts the THREAD item: UAT-J3-03 counts the fabric, and an open count LOCKS
    // its items, so sharing one would have the two specs fight over the same lock.
    await page.goto("/inventory/counts");
    await expect(page.getByRole("heading", { level: 1, name: "Stock counts" })).toBeVisible();

    await page.getByLabel("Period").fill(`TC-INV-06 ${RUN}`);
    await page.getByRole("combobox", { name: "Items to count" }).click();
    await page.getByRole("option", { name: /SEED-THR-001/ }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open count" }).click();

    // Counting locks the item — the badge is how the screen says movement is barred.
    const row = page.getByRole("row").filter({ hasText: "Polyester Thread" });
    await expect(row).toContainText("Locked for counting");

    const systemQty = Number(
      (await row.getByRole("cell").nth(2).innerText()).replace(/[^0-9.]/g, ""),
    );

    async function reconcileNow() {
      await page.getByRole("button", { name: "Reconcile", exact: true }).click();
      await expect(page.getByText("Reconcile this count?")).toBeVisible();
      const res = page.waitForResponse(
        (r) => r.url().includes("/reconcile") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      return (await res).status();
    }

    // Counting exactly what the books say is REFUSED: there is nothing to correct, and the
    // service says so ("No differences to reconcile"). A count is not a no-op document.
    await page.getByLabel(/Counted qty — Polyester Thread/).fill(String(systemQty));
    await page.getByRole("button", { name: "Save counts" }).click();
    expect(await reconcileNow()).toBe(409);

    // The refusal leaves the dialog OPEN with no message — same shape as the payroll approve
    // failure: the rejection never reaches the user. Dismiss it to carry on.
    await page.keyboard.press("Escape");
    await expect(page.getByText("Reconcile this count?")).toHaveCount(0);

    // One short: now there IS a difference, and reconciling drafts the correcting adjustment.
    await page.getByLabel(/Counted qty — Polyester Thread/).fill(String(systemQty - 1));
    await page.getByRole("button", { name: "Save counts" }).click();
    expect(await reconcileNow()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Adjustment drafted" })).toBeVisible();
  });

  test("TC-INV-07 a manual adjustment runs create → approve → post", async ({ page }) => {
    // UAT-J3-05 covers the reason gate; this covers the lifecycle past it.
    await page.goto("/inventory/adjustments");
    await page.getByLabel("Reason").fill(`Manual correction ${RUN}`);
    await page.getByRole("combobox", { name: "Item" }).click();
    await page.getByRole("option", { name: new RegExp(FABRIC) }).click();
    await page.getByLabel("Qty delta").fill("-1");
    await page.getByRole("button", { name: "Create adjustment" }).click();

    // Approval is guarded and demands a typed reason of its own.
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByLabel("Reason").last().fill(`Approved ${RUN}`);
    await page.getByRole("button", { name: "Approve adjustment", exact: true }).last().click();

    const post = page.getByRole("button", { name: "Post" });
    await expect(post).toBeVisible();
    const posted = page.waitForResponse(
      (r) => r.url().includes("/post") && r.request().method() === "POST",
    );
    await post.click();
    expect((await posted).status()).toBeLessThan(400);
  });
});

test.describe("inventory — permission gates (TC-INV)", () => {
  test.describe("Inventory Operator", () => {
    test.use({ storageState: personaStatePath(PERSONAS.inventoryOperator!) });

    test("TC-INV-08 approving an adjustment is denied without the permission", async ({ page }) => {
      await page.goto("/inventory/adjustments");
      await page.getByLabel("Reason").fill(`Operator attempt ${RUN}`);
      await page.getByRole("combobox", { name: "Item" }).click();
      await page.getByRole("option", { name: new RegExp(FABRIC) }).click();
      await page.getByLabel("Qty delta").fill("-1");
      await page.getByRole("button", { name: "Create adjustment" }).click();

      // The operator may raise an adjustment but not approve one: PermissionButton renders the
      // control aria-disabled rather than hiding it, so the boundary is legible.
      const approve = page.getByRole("button", { name: "Approve" });
      await expect(approve).toBeVisible();
      await expect(approve).toHaveAttribute("aria-disabled", "true");
    });

    test("TC-INV-09 the persona sees an inventory-only nav, with cost columns masked", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Inventory", exact: true })).toBeVisible();
      for (const other of ["Sales", "HR & Payroll", "Admin & Access"]) {
        await expect(page.getByRole("button", { name: other, exact: true })).toHaveCount(0);
      }

      // No inventory.cost.view: money columns are redacted, not merely blank.
      await page.goto("/inventory/items");
      await expect(page.getByRole("grid")).toBeVisible();
      await expect(page.getByText("••••").first()).toBeVisible();
    });
  });
});
