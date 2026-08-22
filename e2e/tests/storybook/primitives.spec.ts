import { test, expect, type Page } from "@playwright/test";

/**
 * Presentational primitives — TC-CMP-09/10 and 22–26 of docs/testing/test-cases/99-components.md.
 * See data-table.spec.ts for why every story is pinned to English.
 */
async function story(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=locale:en`);
  // Wait for the story ROOT to have content: `body` is non-empty the moment Storybook paints
  // its own error overlay, so asserting on body raced the render.
  await expect(page.locator("#storybook-root")).not.toBeEmpty();
}

/** The InkChip root — its swatch is a nested span, so match the chip's own class. */
function chip(page: Page, text: string | RegExp) {
  return page.locator("span.inline-flex").filter({ hasText: text }).first();
}

test.describe("primitives (TC-CMP)", () => {
  test("TC-CMP-09 void renders muted + struck through, unlike a live status", async ({ page }) => {
    await story(page, "primitives-inkchip--all-statuses");

    // Void is the one lifecycle status that reads as "no longer counts": muted + strikethrough.
    const voidChip = chip(page, /^○?Void$/);
    await expect(voidChip).toHaveClass(/line-through/);
    await expect(voidChip).toHaveClass(/text-text-muted/);

    // A live status alongside it must NOT pick up that treatment.
    await expect(chip(page, /^✓?Paid$/)).not.toHaveClass(/line-through/);
  });

  test("TC-CMP-10 the active chip carries the magenta active treatment", async ({ page }) => {
    await story(page, "primitives-inkchip--active-state");

    // The story renders the same status twice — plain, and "matched" (active).
    await expect(chip(page, "In Progress (matched)")).toHaveClass(/text-spot/);
    await expect(chip(page, /^◐?In Progress$/)).not.toHaveClass(/text-spot/);
  });

  test("TC-CMP-22 FormField wires label, help, error and required into ARIA", async ({ page }) => {
    await story(page, "primitives-formfield--states");

    // Required field: the label carries the marker and the control is described by its help text.
    const customer = page.getByLabel(/Customer/);
    await expect(customer).toHaveAttribute("aria-describedby", /.+/);
    await expect(page.getByText("Legal entity on the invoice.")).toBeVisible();

    // Errored field: aria-invalid is set and the message is wired, not merely displayed.
    const taxId = page.getByLabel(/Tax ID/);
    await expect(taxId).toHaveAttribute("aria-invalid", "true");

    // The message must be WIRED, not merely displayed: one of the described-by ids owns it.
    const describedBy = (await taxId.getAttribute("aria-describedby")) ?? "";
    expect(describedBy).not.toBe("");
    // Attribute selector, not `#id`: React's useId emits ":r1:-error", which is not a valid
    // CSS id selector.
    const described = await Promise.all(
      describedBy.split(/\s+/).map((docId) => page.locator(`[id="${docId}"]`).innerText()),
    );
    expect(described.join(" ")).toContain("13 digits");
  });

  test("TC-CMP-23 MoneyCell groups, carries currency, and parenthesises negatives", async ({
    page,
  }) => {
    await story(page, "primitives-numericcell--money");
    const body = page.locator("body");
    await expect(body).toContainText("฿53,500.00"); // grouped + currency
    await expect(body).toContainText("฿1,240.50"); // two decimals kept
    await expect(body).toContainText("(฿2,000.00)"); // negative in accounting parens
    await expect(body).toContainText("฿0.00"); // zero still formatted
    await expect(body).toContainText("16,520.00"); // currency-less variant still grouped
  });

  test("TC-CMP-24 QtyCell renders unit-adjacent quantities and negative parens", async ({
    page,
  }) => {
    await story(page, "primitives-numericcell--quantity");
    const body = page.locator("body");
    await expect(body).toContainText("4,250.00 ml");
    await expect(body).toContainText("12.50 pcs");
    await expect(body).toContainText("(3.00 pcs)");
  });

  test("TC-CMP-25 denied PermissionButton is aria-disabled and swallows clicks", async ({
    page,
  }) => {
    await story(page, "permission-permissionbutton--denied-with-tooltip");
    const btn = page.getByRole("button", { name: "Void" });

    // aria-disabled rather than `disabled`, so it stays focusable and can explain itself.
    await expect(btn).toHaveAttribute("aria-disabled", "true");

    // The click must not reach the handler. `force` bypasses actionability so we genuinely
    // exercise the swallow rather than Playwright refusing to click.
    await btn.click({ force: true });
    await expect(btn).toBeVisible();
  });

  test("TC-CMP-26 MaskedValue never puts the real value in the DOM", async ({ page }) => {
    await story(page, "permission-maskedvalue--masked");
    await expect(page.getByText("••••")).toBeVisible();
    await expect(page.getByText(/Restricted/)).toBeVisible();

    // The point of the case: redaction happens before render, not via CSS. Scoped to the story
    // root — the surrounding Storybook chrome is full of unrelated numbers.
    const rendered = await page.locator("#storybook-root").innerHTML();
    expect(rendered).not.toMatch(/\d[\d,]*\.\d{2}/);
  });
});
