import { test, expect, type Page } from "@playwright/test";

/**
 * Inventory — UAT journey J3 "Procure to Stock" (docs/uat/journeys/J3-procure-to-stock.md).
 * Receive a delivery with landed cost, count the shelf, and correct the books under guard.
 *
 * SEED DATA: `Fabric Roll — White` (SEED-FAB-KG-001, base UOM KG) and `Polyester Thread`
 * (SEED-THR-001, base UOM PCS) come from `pnpm db:seed`.
 *
 * DEVIATION from the journey text, deliberate:
 *
 *  - UAT-J3-01 asserts the two items are *on file*; it does not create them through the UI.
 *    The item-create form asks for the base UOM's raw uuid in a text box ("The contract has no
 *    UOM catalog endpoint yet" — items-list.tsx), which no test, and realistically no human,
 *    can supply. Seeding them is the only deterministic route. The missing UOM picker is a real
 *    gap worth a follow-up, not something to paper over here.
 *
 *  - Stock is CUMULATIVE, so the journey's absolute figures (20 kg on hand → 18 kg) only hold
 *    on a virgin database. CI gets one; a developer re-running locally does not. This spec
 *    therefore asserts the *variance* the journey actually accepts on — a −2 KG shortfall
 *    drafting a −2 KG adjustment — by reading the system qty the screen reports and counting
 *    two less. Same business rule, repeatable on a dirty database.
 *
 * NO RELOADS between J3-02 and J3-04: counts and adjustments live in a per-session client store
 * (the contract has no listing endpoint for either), exactly as the journey warns.
 */

// `supplier_id` has no FK yet — the M6 supplier table adds it (schema/inventory/ledger.ts), so
// any uuid is accepted today. Fixed here so the receipt is identifiable in the list.
const SUPPLIER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FABRIC = "SEED-FAB-KG-001";
const THREAD = "SEED-THR-001";

/** Pick an option out of an @erp/ui Combobox (Radix popover + role=listbox). */
async function pickCombobox(page: Page, label: string, optionText: RegExp, index = 0) {
  await page.getByRole("combobox", { name: label }).nth(index).click();
  await page.getByRole("option", { name: optionText }).click();
}

// Serial: these share one item's stock. An open count LOCKS its items ("Locked for counting"),
// so J3-05's manual adjustment must not overlap J3-03's count, and the receipt must land before
// the count reads a book quantity.
test.describe.configure({ mode: "serial" });

test.describe("inventory — procure to stock (UAT journey J3)", () => {
  test("UAT-J3-01 both purchased items are on file", async ({ page }) => {
    await page.goto("/inventory/items");
    await expect(page.getByRole("heading", { level: 1, name: "Items" })).toBeVisible();
    await expect(page.getByText(FABRIC)).toBeVisible();
    await expect(page.getByText(THREAD)).toBeVisible();
  });

  test("UAT-J3-02/03/04 receive with landed cost, count the shortfall, approve and post", async ({
    page,
  }) => {
    // ---- UAT-J3-02: goods receipt with landed cost -------------------------------------
    await page.goto("/inventory/receipts");
    await expect(page.getByRole("heading", { level: 1, name: "Goods receipts" })).toBeVisible();
    await page.getByRole("button", { name: "New receipt" }).click();

    await page.getByLabel("Supplier ID").fill(SUPPLIER_ID);

    // Line 1 — fabric, 20 KG @ ฿100 (line value 2,000). Receiving UOM left blank = base UOM.
    await pickCombobox(page, "Item", new RegExp(FABRIC), 0);
    await page.getByLabel("Qty").nth(0).fill("20");
    await page.getByLabel("Unit price").nth(0).fill("100");

    // Line 2 — thread, 10 PCS @ ฿100 (line value 1,000).
    await page.getByRole("button", { name: "Add line" }).click();
    await pickCombobox(page, "Item", new RegExp(THREAD), 1);
    await page.getByLabel("Qty").nth(1).fill("10");
    await page.getByLabel("Unit price").nth(1).fill("100");

    await page.getByRole("button", { name: "Continue" }).click();

    // Landed cost: ฿300 freight split BY VALUE across 2,000 : 1,000 → ฿200 / ฿100.
    await page.getByLabel("Freight / import total").fill("300");
    // Scoped per row, not a loose page-wide text match: the split is the acceptance criterion.
    await expect(page.getByRole("row").filter({ hasText: "Fabric Roll" })).toContainText("200.00");
    await expect(page.getByRole("row").filter({ hasText: "Polyester Thread" })).toContainText("100.00");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Review lines")).toBeVisible();
    await page.getByRole("button", { name: "Create & confirm receipt" }).click();

    // The wizard creates AND confirms in one action, so the row lands on Confirmed.
    const receiptRow = page.getByRole("row").filter({ hasText: "Confirmed" }).first();
    await expect(receiptRow).toBeVisible();

    // Post it — posting is what creates the lots and the incoming ledger rows.
    await receiptRow.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "Post" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Posted" }).first()).toBeVisible();

    // ---- UAT-J3-03: count the fabric, two short --------------------------------------
    await page.goto("/inventory/counts");
    await expect(page.getByRole("heading", { level: 1, name: "Stock counts" })).toBeVisible();

    await page.getByLabel("Period").fill("J3 cycle count");
    await pickCombobox(page, "Items to count", new RegExp(FABRIC));
    await page.keyboard.press("Escape"); // multi-select stays open after picking
    await page.getByRole("button", { name: "Open count" }).click();

    // The screen reports the book quantity; count two less than whatever it says, so the
    // −2 variance holds on a database that already has stock from earlier runs.
    // Columns: 0 Item · 1 "Locked for counting" badge · 2 System qty · 3 Counted qty.
    const systemQtyCell = page.getByRole("row").filter({ hasText: "Fabric Roll" }).getByRole("cell").nth(2);
    await expect(systemQtyCell).toBeVisible();
    const systemQty = Number((await systemQtyCell.innerText()).replace(/[^0-9.]/g, ""));
    expect(systemQty).toBeGreaterThanOrEqual(20);

    await page.getByLabel(/Counted qty — Fabric Roll/).fill(String(systemQty - 2));
    await page.getByRole("button", { name: "Save counts" }).click();

    await page.getByRole("button", { name: "Reconcile", exact: true }).click();
    await expect(page.getByText("Reconcile this count?")).toBeVisible();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();

    // Reconciling auto-drafts the correcting adjustment — nobody keys it by hand.
    await expect(page.getByRole("heading", { name: "Adjustment drafted" })).toBeVisible();
    // QtyCell renders negatives in accounting parentheses, so a −2 shortfall reads "(2.00)".
    await expect(page.getByRole("listitem").filter({ hasText: "Fabric Roll" })).toContainText("(2.00)");

    // ---- UAT-J3-04: guarded approval, then post ---------------------------------------
    await page.getByRole("button", { name: "Approve adjustment" }).click();
    // Approving a stock adjustment is a protected action: the guard demands a typed reason.
    await page.getByLabel("Reason").fill("Cycle count variance — 2 kg shrinkage");
    await page.getByRole("button", { name: "Approve adjustment", exact: true }).last().click();

    // Positive evidence the guard let it through: DRAFT hides Post, APPROVED reveals it.
    const postBtn = page.getByRole("button", { name: "Post adjustment" });
    await expect(postBtn).toBeVisible();
    await postBtn.click();

    // Posting is what moves the books: the toast confirms, and the action retires with the status.
    await expect(page.getByText("Adjustment posted")).toBeVisible();
    await expect(postBtn).toHaveCount(0);
  });

  test("UAT-J3-05 a stock adjustment without a reason is blocked", async ({ page }) => {
    await page.goto("/inventory/adjustments");
    await expect(page.getByRole("heading", { level: 1, name: "Stock adjustments" })).toBeVisible();

    // Blank reason: the screen must refuse and say why. Nothing is recorded.
    await pickCombobox(page, "Item", new RegExp(FABRIC));
    await page.getByLabel("Qty delta").fill("-1");
    await page.getByRole("button", { name: "Create adjustment" }).click();
    await expect(page.getByText("A reason is required.")).toBeVisible();
    await expect(page.getByText("No adjustment created this session yet.")).toBeVisible();

    // With a reason, the same submission goes through as a Draft awaiting the guarded approval.
    await page.getByLabel("Reason").fill("Damaged in handling");
    await page.getByRole("button", { name: "Create adjustment" }).click();
    await expect(page.getByText("A reason is required.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  });
});
