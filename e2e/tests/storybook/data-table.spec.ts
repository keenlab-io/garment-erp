import { test, expect } from "@playwright/test";

/**
 * DataTable component behaviours — TC-CMP-01..08 of docs/testing/test-cases/99-components.md.
 *
 * Runs under the `storybook` Playwright project against :6006 (no backend, no auth). Each test
 * loads a story's iframe directly, so the surrounding Storybook chrome is out of the way.
 *
 * Prerequisite: `pnpm --filter @erp/ui storybook`.
 */

/**
 * Load one story in isolation, PINNED TO ENGLISH. Storybook's default locale here is Thai, so
 * without `globals=locale:en` the built-in controls come back as "ถัดไป"/"เลือกทุกแถว" and every
 * role-name lookup misses.
 */
async function story(page: import("@playwright/test").Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=locale:en`);
  await expect(page.getByRole("grid").first()).toBeVisible();
}

/** Document ids of the rendered rows, top to bottom. */
async function docOrder(page: import("@playwright/test").Page): Promise<string[]> {
  return page.getByRole("row").locator("td:first-child").allInnerTexts();
}

test.describe("DataTable (TC-CMP)", () => {
  test("TC-CMP-01 sortable header cycles asc → desc → none", async ({ page }) => {
    await story(page, "organisms-datatable--default");
    const header = page.getByRole("columnheader", { name: "Document" });
    const original = await docOrder(page);

    await header.click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    expect((await docOrder(page))[0]).toBe("QV20260037");

    await header.click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
    expect((await docOrder(page))[0]).toBe("QV20260042");

    // Third click clears the sort — the fixture order returns, and the header stops advertising one.
    await header.click();
    expect(await docOrder(page)).toEqual(original);
    expect(await header.getAttribute("aria-sort")).not.toBe("ascending");
  });

  test("TC-CMP-02 cursor pagination: Next disables at a null cursor, Prev returns", async ({
    page,
  }) => {
    await story(page, "organisms-datatable--pagination");
    const next = page.getByRole("button", { name: /next/i });
    const prev = page.getByRole("button", { name: /prev/i });

    const pageOne = await docOrder(page);
    await expect(next).toBeEnabled();
    await next.click();

    const pageTwo = await docOrder(page);
    expect(pageTwo).not.toEqual(pageOne);
    // End of list: the parent hands back a null cursor, so Next retires.
    await expect(next).toBeDisabled();

    await prev.click();
    expect(await docOrder(page)).toEqual(pageOne);
  });

  test("TC-CMP-03 bulk selection shows the count bar and select-all covers every row", async ({
    page,
  }) => {
    await story(page, "organisms-datatable--with-selection");
    const rowBoxes = page.getByRole("checkbox", { name: "Select row" });
    await rowBoxes.nth(0).click();
    await rowBoxes.nth(1).click();
    await expect(page.getByText("2 selected")).toBeVisible();

    // Select-all lifts the count to the full fixture (6 rows).
    await page.getByRole("checkbox", { name: "Select all rows" }).click();
    await expect(page.getByText("6 selected")).toBeVisible();
  });

  test("TC-CMP-06 density=touch hides secondary columns", async ({ page }) => {
    // Qty and Owner are declared `secondary`; touch density drops them on top of any preset.
    await story(page, "organisms-datatable--density-matrix");

    // The story stacks one table per density. Comfortable keeps the secondary columns…
    const comfortable = page.locator('[data-density="comfortable"]').getByRole("grid").first();
    await expect(comfortable.getByRole("columnheader", { name: "Owner" })).toBeVisible();
    await expect(comfortable.getByRole("columnheader", { name: "Qty" })).toBeVisible();

    // …while touch drops them, on top of whatever the user's preset says.
    const touch = page.locator('[data-density="touch"]').getByRole("grid").first();
    await expect(touch.getByRole("columnheader", { name: "Document" })).toBeVisible();
    await expect(touch.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);
    await expect(touch.getByRole("columnheader", { name: "Qty" })).toHaveCount(0);
  });

  test("TC-CMP-07 empty state renders title, description and CTA", async ({ page }) => {
    await story(page, "organisms-datatable--empty");
    // The story supplies its own emptyState, overriding the `table` namespace default.
    await expect(page.getByText("No quotations yet")).toBeVisible();
    await expect(page.getByText("Quotations you create will appear here.")).toBeVisible();
    await expect(page.getByRole("button", { name: "New quotation" })).toBeVisible();
  });

  test("TC-CMP-08 error state shows the message with a working Retry", async ({ page }) => {
    await story(page, "organisms-datatable--error-state");
    await expect(page.getByText("Couldn't load this list")).toBeVisible();
    await expect(page.getByText(/didn't respond/)).toBeVisible();

    // Presentational: Retry only emits intent, but it must be offered and must survive a click.
    const retry = page.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(retry).toBeVisible();
  });

  test("TC-CMP-04 column presets persist across reload for the same table id", async ({ page }) => {
    // The story persists to localStorage keyed by tableId — clear it or runs leak into each other.
    await story(page, "organisms-datatable--saved-presets");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("checkbox", { name: "Owner" }).click();
    await page.getByRole("button", { name: "Save view" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);

    // The preset is the point: it must survive a full reload, not just a re-render.
    await page.reload();
    await expect(page.getByRole("grid").first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Owner" })).toHaveCount(0);

    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("columnheader", { name: "Owner" })).toBeVisible();
  });

  test("TC-CMP-05 roving tabindex: arrows move the active row, Space toggles", async ({ page }) => {
    await story(page, "organisms-datatable--with-selection");

    // Roving tabindex: exactly one row is active/tabbable at a time (`data-active` +
    // tabIndex=0 in data-table.tsx), and the arrows move which one.
    const rows = page.locator("tbody tr[data-row-index]");
    await rows.first().click();
    await expect(rows.first()).toHaveAttribute("data-active", /.*/);

    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toHaveAttribute("data-active", /.*/);
    await expect(rows.first()).not.toHaveAttribute("data-active", /.*/);

    // Space toggles the ACTIVE row's selection without moving the active row.
    await page.keyboard.press("Space");
    await expect(page.getByText("1 selected")).toBeVisible();
    await expect(rows.nth(1)).toHaveAttribute("data-active", /.*/);

    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Space");
    await expect(page.getByText("2 selected")).toBeVisible();
  });
});
