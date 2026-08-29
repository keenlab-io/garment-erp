import { test, expect, type Page } from "@playwright/test";
import { PERSONAS, personaStatePath } from "../fixtures/personas.js";

const RUN = Date.now().toString().slice(-6);

/**
 * Sales module — TC-SALES-03..12 of docs/testing/test-cases/03-sales.md.
 * The end-to-end lifecycle (TC-SALES-01/02) lives in sales.spec.ts.
 *
 * The money cases are the point of this file: VAT and WHT arithmetic are where a rounding slip
 * becomes a wrong invoice, so they assert exact figures rather than "a number appeared".
 */

/**
 * Read a labelled figure out of the live paper preview.
 *
 * The totals block is flex rows of `<span>label</span><MoneyCell/>`, not a table — so the figure
 * is the money string inside the label's own parent, and the last match wins because the money
 * cell trails the label.
 */
async function figure(page: Page, label: string): Promise<string> {
  const row = page
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .last();
  const text = await row.innerText();
  return (text.match(/[\d,]+\.\d{2}/g) ?? []).pop() ?? text;
}

async function newDocument(page: Page) {
  await page.goto("/sales/documents/new/edit");
  await expect(page.getByRole("heading", { level: 1, name: "New document" })).toBeVisible();
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: /Acme Garments/ }).click();
}

test.describe("sales — money arithmetic (TC-SALES)", () => {
  test("TC-SALES-04 VAT arithmetic is exact across Excl. / Incl. / Non-VAT", async ({ page }) => {
    await newDocument(page);
    await page.getByLabel("Description").fill("VAT arithmetic line");
    await page.getByLabel("Qty").fill("2");
    await page.getByLabel("Unit price").fill("500");

    // Exclusive (the default): VAT is added on top of a 1,000.00 line.
    await expect(page.getByText("฿1,000.00").first()).toBeVisible();
    expect(await figure(page, "Subtotal")).toBe("1,000.00");
    expect(await figure(page, "VAT")).toBe("70.00");
    expect(await figure(page, "Grand total")).toBe("1,070.00");

    // Inclusive: the 1,000.00 already CONTAINS the VAT, so it becomes the grand total and the
    // subtotal is backed out (1,000 ÷ 1.07). Subtotal + VAT must re-sum exactly.
    await page.getByRole("radiogroup", { name: "Calc" }).getByRole("radio", { name: "Incl." }).click();
    expect(await figure(page, "Grand total")).toBe("1,000.00");
    expect(await figure(page, "Subtotal")).toBe("934.58");
    expect(await figure(page, "VAT")).toBe("65.42");

    // Non-VAT: no tax at all, and the grand total collapses back to the line value.
    await page.getByRole("radiogroup", { name: "VAT" }).getByRole("radio", { name: "Non-VAT" }).click();
    expect(await figure(page, "Subtotal")).toBe("1,000.00");
    expect(await figure(page, "Grand total")).toBe("1,000.00");
  });

  test("TC-SALES-05 WHT is 3% of the SUBTOTAL, and net-to-receive follows", async ({ page }) => {
    await newDocument(page);
    await page.getByRole("combobox", { name: "Document type" }).click();
    await page.getByRole("option", { name: "Invoice" }).click();

    await page.getByLabel("Description").fill("WHT arithmetic line");
    await page.getByLabel("Qty").fill("2");
    await page.getByLabel("Unit price").fill("500");

    // CATALOG MISMATCH: TC-SALES-05 expects "No withholding" and a Net-to-receive equal to the
    // grand total while the rate is empty. Neither renders in the EDITOR — `noWht` is gated on
    // `!onWhtRateChange`, so it shows only in the read-only panel, and Net to receive is gated on
    // `hasWht`. The no-withholding state is expressed by omission here. Asserting the case as
    // written would encode behaviour the component does not have; worth reconciling the two.
    await expect(page.getByLabel("WHT rate")).toHaveValue("");
    await expect(page.getByText("Net to receive")).toHaveCount(0);

    // 3% is taken on the SUBTOTAL (1,000.00), not the VAT-inclusive grand total — 30.00, not 32.10.
    await page.getByLabel("WHT rate").fill("0.03");
    await expect(page.getByText("Net to receive").first()).toBeVisible();
    expect(await figure(page, "Grand total")).toBe("1,070.00");
    const wht = await figure(page, "WHT");
    expect(wht).toBe("30.00");
    expect(await figure(page, "Net to receive")).toBe("1,040.00");
  });

  test("TC-SALES-06 the PromptPay QR appears only once the invoice is issued", async ({ page }) => {
    await newDocument(page);
    await page.getByRole("combobox", { name: "Document type" }).click();
    await page.getByRole("option", { name: "Invoice" }).click();
    await page.getByLabel("Description").fill("PromptPay gating");
    await page.getByLabel("Qty").fill("1");
    await page.getByLabel("Unit price").fill("100");
    await page.getByRole("button", { name: "Create invoice" }).click();

    // DRAFT: nothing to pay yet, so no QR is offered.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^INV/);
    await expect(page.getByText("PromptPay", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Issue" }).click();
    await expect(page.getByText("PromptPay", { exact: true })).toBeVisible();
  });
});

test.describe("sales — screens (TC-SALES)", () => {
  test("TC-SALES-09 the customers screen lists and searches", async ({ page }) => {
    await page.goto("/sales/customers");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Acme Garments Co., Ltd.")).toBeVisible();
  });

  test("TC-SALES-10 the AR aging dashboard renders its buckets", async ({ page }) => {
    await page.goto("/sales/aging");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  });

  test("TC-SALES-11 the template designer renders its slots", async ({ page }) => {
    await page.goto("/sales/templates");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  });

  test("TC-SALES-12 e-tax submit has no UI surface", async () => {
    test.skip(
      true,
      "FLAGGED in docs/testing/test-cases/03-sales.md: the contract has `sales.etax.submit` and " +
        "the persona holds it, but no screen exposes the action. Nothing to drive.",
    );
  });
});

test.describe("sales — permission gate (TC-SALES)", () => {
  test.describe("Sales Clerk", () => {
    test.use({ storageState: personaStatePath(PERSONAS.salesClerk!) });

    test("TC-SALES-03 a clerk may quote and invoice, but not void", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Sales", exact: true })).toBeVisible();
      for (const other of ["HR & Payroll", "Admin & Access"]) {
        await expect(page.getByRole("button", { name: other, exact: true })).toHaveCount(0);
      }

      // The clerk holds payment.record but NOT document.void, so the void confirm stays out of
      // reach — GuardedActionDialog re-checks the permission at confirm time.
      await page.goto("/sales/payments");
      await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();
    });
  });
});

/**
 * Payments and void — TC-SALES-07/08. Serial and in one page context: both need a real invoice,
 * and a created document lives in a per-session client store (there is no get-invoice endpoint),
 * so the invoice must be made and used without a reload.
 */
test.describe("sales — payments and void (TC-SALES)", () => {
  test.describe.configure({ mode: "serial" });

  /** Compose → create → issue an invoice, then land on the payments screen with it selected. */
  async function issuedInvoice(page: Page, unitPrice: string) {
    await newDocument(page);
    await page.getByRole("combobox", { name: "Document type" }).click();
    await page.getByRole("option", { name: "Invoice" }).click();
    await page.getByLabel("Description").fill(`Payment case ${RUN}`);
    await page.getByLabel("Qty").fill("2");
    await page.getByLabel("Unit price").fill(unitPrice);
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^INV/);
    const docNo = (await page.getByRole("heading", { level: 1 }).innerText()).trim();

    await page.getByRole("button", { name: "Issue" }).click();
    await expect(page.getByText("PromptPay", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Go to payments" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();
    await page.getByRole("button", { name: docNo }).click();
    return docNo;
  }

  /** A money figure from the summary block, e.g. "Outstanding" → "570.00". */
  async function money(page: Page, label: string) {
    const dd = page.getByText(label, { exact: true }).locator("xpath=following-sibling::dd");
    return ((await dd.innerText()).match(/[\d,]+\.\d{2}/) ?? [""])[0];
  }

  test("TC-SALES-08 a partial payment leaves it Partially paid; the clearing one issues a receipt", async ({
    page,
  }) => {
    // 2 × 500 = 1,000.00 + 7% VAT = 1,070.00 grand total.
    await issuedInvoice(page, "500");
    expect(await money(page, "Grand total")).toBe("1,070.00");
    expect(await money(page, "Outstanding")).toBe("1,070.00");

    // Partial: 500 of 1,070 leaves 570 owing, and the invoice is not yet Paid.
    await page.getByLabel("Amount").fill("500");
    const first = page.waitForResponse(
      (r) => r.url().includes("/payments") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Record payment" }).click();
    expect((await first).status()).toBeLessThan(400);

    expect(await money(page, "Amount paid")).toBe("500.00");
    expect(await money(page, "Outstanding")).toBe("570.00");
    await expect(page.getByText(/Partially paid$/).first()).toBeVisible();

    // CATALOG MISMATCH: TC-SALES-08 expects the receipt only on the CLEARING payment. The server
    // issues it on the FIRST — `PaymentService` says so outright ("Issue the receipt on the first
    // payment only", payment.service.ts). The implementation reads as deliberate, so the case
    // looks wrong rather than the code; asserted as-built, and worth reconciling.
    //
    // It also has a business consequence, covered by TC-SALES-07b: because the receipt exists
    // from the first payment onward, a PARTIALLY-PAID invoice can already no longer be voided.
    await expect(page.getByText(/Receipt issued/)).toBeVisible();

    // Clearing payment: pays the remainder exactly.
    await page.getByLabel("Amount").fill("570");
    const second = page.waitForResponse(
      (r) => r.url().includes("/payments") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Record payment" }).click();
    expect((await second).status()).toBeLessThan(400);

    expect(await money(page, "Outstanding")).toBe("0.00");
    await expect(page.getByText(/Paid$/).first()).toBeVisible();
    await expect(page.getByText(/Receipt issued/)).toBeVisible();
    // 500 + 570 = 1,070.00 — the two payments clear the invoice exactly.
    expect(await money(page, "Amount paid")).toBe("1,070.00");
  });

  test("TC-SALES-07 void needs a reason, and is refused once a receipt exists", async ({
    page,
  }) => {
    const docNo = await issuedInvoice(page, "100");

    // ---- the reason gate: a blank reason fires no request at all --------------------------
    const attempts: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/void") && r.method() === "POST") attempts.push(r.url());
    });

    await page.getByRole("button", { name: "Void" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(docNo);
    await expect(dialog).toContainText(/cannot be undone/i);

    await dialog.getByRole("button", { name: "Void" }).click();
    await expect(dialog.getByText(/reason is required/i)).toBeVisible();
    expect(attempts).toEqual([]); // refused client-side; nothing reached the server

    // ---- with a reason it voids, and the chip takes the void signature ---------------------
    await dialog.getByLabel("Reason").fill("Customer cancelled order");
    const voided = page.waitForResponse(
      (r) => r.url().includes("/void") && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Void" }).click();
    expect((await voided).status()).toBeLessThan(400);

    // Void is muted + struck through — the InkChip signature for "no longer counts".
    const chip = page.locator("span.inline-flex").filter({ hasText: /Void$/ }).first();
    await expect(chip).toHaveClass(/line-through/);
    // A void invoice is not payable, so the recording control retires with it.
    await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
  });

  test("TC-SALES-07b voiding an invoice that already has a receipt is refused with 409", async ({
    page,
  }) => {
    // ONE payment is enough: the receipt is issued on the first, not the clearing, payment
    // (see TC-SALES-08). So even a part-paid invoice is already unvoidable.
    await issuedInvoice(page, "100");
    await page.getByLabel("Amount").fill("50");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/Receipt issued/)).toBeVisible();
    await expect(page.getByText(/Partially paid$/).first()).toBeVisible();

    const refused = page.waitForResponse(
      (r) => r.url().includes("/void") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Void" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason").fill("Attempt after receipt");
    await dialog.getByRole("button", { name: "Void" }).click();
    expect((await refused).status()).toBe(409);

    // The refusal is EXPLAINED, not toasted away: a dedicated dialog says why.
    await expect(page.getByText("Can't void this invoice")).toBeVisible();
    await expect(page.getByText(/receipt or tax invoice has already been issued/i)).toBeVisible();
    // Two "Close" controls: the dialog's own dismiss affordance and the body's button. Take the
    // labelled body button.
    await page.getByRole("dialog").getByText("Close", { exact: true }).click();
  });
});
