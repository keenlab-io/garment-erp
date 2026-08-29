import { test, expect, type Page } from "@playwright/test";
import { PERSONAS, personaStatePath } from "../fixtures/personas.js";

/**
 * Reporting module — TC-RPT-01..11 of docs/testing/test-cases/05-reports.md.
 *
 * The permission cases carry the weight here: the reporting catalog is filtered by held groups,
 * and `reportsViewer` is seeded with report.sales.view + report.inventory.view and nothing else.
 */
const RUN = Date.now().toString().slice(-6);

const DASHBOARDS = [
  "Inventory dashboard",
  "Sales dashboard",
  "Cost dashboard",
  "Profit dashboard",
  "Tax dashboard",
];

async function reportsHome(page: Page) {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
}

/**
 * Scope to the page body. Every dashboard link also exists in the sidebar nav, so an unscoped
 * `getByRole("link")` is a strict-mode violation — and `getByLabel("To")` matches the topbar's
 * "Switch to dark" button.
 */
const main = (page: Page) => page.getByRole("main");

test.describe("reports — catalog (TC-RPT)", () => {
  test("TC-RPT-01 the catalog home lists every dashboard and group for super-admin", async ({
    page,
  }) => {
    await reportsHome(page);
    for (const d of DASHBOARDS) {
      await expect(main(page).getByRole("link", { name: d })).toBeVisible();
    }
    // A sample of the 16 catalog reports, one per group.
    for (const r of ["Stock balance", "Sales overview", "Monthly COGS", "Margin by item", "AR aging"]) {
      await expect(main(page).getByRole("link", { name: r })).toBeVisible();
    }
    // Super-admin holds report.schedule.manage, so the schedules entry is offered.
    await expect(main(page).getByRole("link", { name: "Report schedules" })).toBeVisible();
  });

  test("TC-RPT-02 a dashboard leads to its viewer with dates and a table", async ({ page }) => {
    await reportsHome(page);
    await main(page).getByRole("link", { name: "Sales dashboard" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sales dashboard" })).toBeVisible();

    await main(page).getByRole("link", { name: "View report" }).first().click();
    // Dotted report keys are the viewer's route (e.g. /reports/sales.overview).
    await expect(page).toHaveURL(/\/reports\/[a-z]+\.[a-z_]+/);
    await expect(main(page).getByRole("textbox", { name: "From" })).toBeVisible();
    await expect(main(page).getByRole("textbox", { name: "To" })).toBeVisible();
    await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  });

  test("TC-RPT-06 editing the viewer's From/To keeps it on the report", async ({ page }) => {
    await page.goto("/reports/sales.overview");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await main(page).getByRole("textbox", { name: "From" }).fill("2026-01-01");
    await main(page).getByRole("textbox", { name: "To" }).fill("2026-12-31");
    await expect(page).toHaveURL(/\/reports\/sales\.overview/);
    await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  });

  test("TC-RPT-08/10 a schedule can be created and deleted with confirmation", async ({
    page,
  }) => {
    await page.goto("/reports/schedules");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const name = `Weekly digest ${RUN}`;
    await main(page).getByLabel("Schedule name").fill(name);
    await main(page).getByRole("combobox", { name: "Report" }).click();
    // Wait for the list to actually render before picking — clicking straight away races it and
    // leaves the select open with no value, so Save posts nothing.
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.getByRole("option").first().click();

    // A digest with no recipient would be pointless, so one is added before saving.
    await main(page).getByPlaceholder("name@example.com").fill(`ops.${RUN}@example.com`);
    await main(page).getByRole("button", { name: "Add" }).click();

    const saved = page.waitForResponse(
      (r) => r.url().includes("/report-schedules") && r.request().method() === "POST",
    );
    await main(page).getByRole("button", { name: "Save schedule" }).click();
    expect((await saved).status()).toBeLessThan(400);

    // The list is a <ul> of <li> cards, not a grid — listitem, not row.
    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(`ops.${RUN}@example.com`);

    // Delete states what it costs — the digest emails stop.
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(/stops its digest emails/i)).toBeVisible();
    const deleted = page.waitForResponse(
      (r) => r.url().includes("/report-schedules") && r.request().method() === "DELETE",
    );
    // The dialog passes no confirmLabel, so it falls back to the shared "Confirm" (common.ts),
    // not the row action's "Delete".
    await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
    expect((await deleted).status()).toBeLessThan(400);
    await expect(row).toHaveCount(0);
  });
});

test.describe("reports — permission gates (TC-RPT)", () => {
  test.describe("Reports Viewer", () => {
    test.use({ storageState: personaStatePath(PERSONAS.reportsViewer!) });

    test("TC-RPT-03 the catalog filters to the groups the persona holds", async ({ page }) => {
      await reportsHome(page);

      // Seeded with report.sales.view + report.inventory.view — those two dashboards and no more.
      await expect(main(page).getByRole("link", { name: "Sales dashboard" })).toBeVisible();
      await expect(main(page).getByRole("link", { name: "Inventory dashboard" })).toBeVisible();
      for (const absent of ["Cost dashboard", "Profit dashboard", "Tax dashboard"]) {
        await expect(main(page).getByRole("link", { name: absent })).toHaveCount(0);
      }

      // Absent, not disabled — and the palette agrees with the page.
      await page.keyboard.press("Control+k");
      await expect(page.locator("[cmdk-root]")).toBeVisible();
      await page.locator("[cmdk-input]").fill("cost");
      await expect(page.getByRole("option", { name: /cost dashboard/i })).toHaveCount(0);
      await page.keyboard.press("Escape");
    });

    test("TC-RPT-11 schedules require report.schedule.manage", async ({ page }) => {
      await reportsHome(page);
      await expect(main(page).getByRole("link", { name: "Report schedules" })).toHaveCount(0);

      await page.goto("/reports/schedules");
      await page.waitForURL((url) => !url.pathname.startsWith("/reports/schedules"));
      expect(page.url()).not.toContain("/reports/schedules");
    });

    test("TC-RPT-04 a dashboard the persona lacks is not enterable", async ({ page }) => {
      // Cost/profit additionally require inventory.cost.view; this persona holds neither the
      // report group nor the cost permission, so the route is refused outright.
      await page.goto("/reports/dashboards/cost");
      await page.waitForURL((url) => !url.pathname.includes("/dashboards/cost"));
      expect(page.url()).not.toContain("/dashboards/cost");
    });
  });
});

/**
 * Async job lifecycles — TC-RPT-07/09. Both poll `GET /exports/:job_id` until the job resolves,
 * so both script that endpoint with `page.route` rather than depending on a real worker: the
 * point under test is how the UI narrates a job, not how fast the queue drains.
 */
test.describe("reports — async jobs (TC-RPT)", () => {
  /** Force every job poll to answer `status`, so DONE and FAILED are both reachable on demand. */
  async function scriptJobPoll(page: Page, status: "DONE" | "FAILED") {
    await page.route(/\/api\/v1\/exports\/[^/]+$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "scripted",
          status,
          file_url: status === "DONE" ? "https://example.invalid/report.pdf" : null,
        }),
      }),
    );
  }

  test("TC-RPT-07 an export job narrates pending → ready with a Download action", async ({
    page,
  }) => {
    await scriptJobPoll(page, "DONE");
    await page.goto("/reports/sales.overview");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The export controls are the raw format enums — stable, if unlovely.
    const enqueued = page.waitForResponse(
      (r) => r.url().includes("/export") && r.request().method() === "POST",
    );
    await main(page).getByRole("button", { name: "PDF" }).click();
    expect((await enqueued).status()).toBe(202);

    // The toast is the only completion signal there is — no export history exists.
    const notifications = page.getByRole("region", { name: /notification/i });
    await expect(notifications).toContainText("Export ready");
    await expect(notifications.getByRole("button", { name: "Download" })).toBeVisible();
  });

  test("TC-RPT-07b a failed export resolves to danger with no Download", async ({ page }) => {
    await scriptJobPoll(page, "FAILED");
    await page.goto("/reports/sales.overview");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await main(page).getByRole("button", { name: "CSV" }).click();

    const notifications = page.getByRole("region", { name: /notification/i });
    await expect(notifications).toContainText("Export failed");
    // Nothing to download — offering the action would be a lie.
    await expect(notifications.getByRole("button", { name: "Download" })).toHaveCount(0);
  });

  test("TC-RPT-09 run-now narrates the digest job, and offers Retry when it fails", async ({
    page,
  }) => {
    // A schedule to run. Created here rather than shared, so this case owns its fixture.
    await page.goto("/reports/schedules");
    const name = `Run-now ${RUN}`;
    await main(page).getByLabel("Schedule name").fill(name);
    await main(page).getByRole("combobox", { name: "Report" }).click();
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.getByRole("option").first().click();
    await main(page).getByPlaceholder("name@example.com").fill(`digest.${RUN}@example.com`);
    await main(page).getByRole("button", { name: "Add" }).click();
    await main(page).getByRole("button", { name: "Save schedule" }).click();

    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(row).toBeVisible();

    // ---- failure first: it is the path that carries a Retry ---------------------------------
    await scriptJobPoll(page, "FAILED");
    await row.getByRole("button", { name: "Run now" }).click();
    const notifications = page.getByRole("region", { name: /notification/i });
    await expect(notifications).toContainText("Digest send failed");
    await expect(notifications.getByRole("button", { name: "Retry" })).toBeVisible();

    // ---- retry, now succeeding ---------------------------------------------------------------
    await scriptJobPoll(page, "DONE");
    await notifications.getByRole("button", { name: "Retry" }).click();
    await expect(notifications).toContainText("Digest sent");
  });
});

test.describe("reports — landing overview (TC-RPT)", () => {
  test("TC-RPT-05 a dimension slice shows the chip rail, and Clear empties the params", async ({
    page,
  }) => {
    // The slice is driven by typed search params. Entering via the URL rather than by clicking a
    // Recharts node is deliberate: chart points carry no stable hook (flagged in the catalog),
    // and the catalog itself names the search-param change as the ground truth.
    await page.goto("/?dimension=day&value=2026-08-01");
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

    const rail = page.getByRole("group", { name: "Active filters" });
    await expect(rail).toBeVisible();
    // The chip renders the dimension and a FORMATTED date ("Day: Aug 1, 2026"), not the raw
    // param — so match the label, not the ISO value that produced it.
    await expect(rail).toContainText("Day:");

    // Clear empties the params and retires the rail; the panels refetch unfiltered.
    //
    // The catalog offers "Remove … or Clear". Only Clear exists here: dashboard.tsx passes
    // `onClear` but no `onRemove`, so ActiveFilterChipRail renders no per-chip remove button —
    // while still passing a `remove` label that nothing consumes. Harmless, but a loose end.
    await rail.getByRole("button", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/$|\/\?$/);
    await expect(page.getByRole("group", { name: "Active filters" })).toHaveCount(0);
  });
});
