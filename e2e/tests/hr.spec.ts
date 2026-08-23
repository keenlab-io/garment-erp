import { test, expect } from "@playwright/test";

/**
 * HR & Payroll — UAT journey J2 "Hire to Payslip" (docs/uat/journeys/J2-hire-to-payslip.md).
 * Ms. Suda joins on ฿30,000/month, works overtime the system must pay at attended hours,
 * and payroll is run and approved under guard.
 *
 * Each run onboards a NEW employee (unique surname): creation does not navigate anywhere, so the
 * spec has to find its own row in the list, and a fixed name would collide across runs.
 *
 * DO NOT ASSERT ON TOASTS here. They auto-dismiss, and every one of them raced this suite at
 * least once. Assert the durable fact instead — the status chip, the settled figure, or the
 * response itself via `page.waitForResponse`.
 */

// Serial: the journey is one continuous story — the payroll run pays the employee hired in the
// first test, using the overtime approved in the second.
test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString().slice(-6);
const FIRST_NAME = "Suda";
const LAST_NAME = `Jaidee-${RUN}`;
const FULL_NAME = `${FIRST_NAME} ${LAST_NAME}`;
const BASE_SALARY = "30000";

const today = new Date().toISOString().slice(0, 10);

/** The EXT-series code the server issues on create — captured in J2-01, used by the
 * attendance import in J2-03, which matches employees by code rather than id. */
let empCode = "";

test.describe("hr — hire to payslip (UAT journey J2)", () => {
  test("UAT-J2-01 employee onboarded with a base salary", async ({ page }) => {
    await page.goto("/hr/employees");
    await expect(page.getByRole("heading", { level: 1, name: "Employees" })).toBeVisible();

    await page.getByRole("button", { name: "Create employee" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("First name").fill(FIRST_NAME);
    await drawer.getByLabel("Last name").fill(LAST_NAME);
    await drawer.getByLabel("Hire date").fill(today);
    // Employment type defaults to Monthly; set it explicitly — the salary basis matters.
    await drawer.getByRole("combobox", { name: "Employment type" }).click();
    await page.getByRole("option", { name: "Monthly" }).click();
    await drawer.getByRole("button", { name: "Create employee" }).click();

    // The drawer closes and the list refreshes — a new hire starts on PROBATION.
    const row = page.getByRole("row").filter({ hasText: LAST_NAME });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Probation");

    // The code is server-issued (EXT-series); the attendance import keys on it.
    // DataTable renders role="grid", so its cells are `gridcell` — not `cell`.
    empCode = (await row.getByRole("gridcell").first().innerText()).trim();
    expect(empCode).toMatch(/^EXT/);

    // ---- base salary lives on the employee's Salary tab, not the create form ----
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "View details" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(FULL_NAME);

    await page.getByRole("tab", { name: "Salary" }).click();
    await page.getByLabel("New base salary").fill(BASE_SALARY);
    await page.getByLabel("Effective date").fill(today);
    await page.getByRole("button", { name: "Add salary record" }).click();

    // Payroll reads this figure; without it she'd be flagged "missing salary" and block the run.
    await expect(page.getByText("Salary record added.")).toBeVisible();
    await expect(page.getByText("30,000", { exact: false }).first()).toBeVisible();
  });

  test("UAT-J2-02 overtime request submitted and approved", async ({ page }) => {
    await page.goto("/hr/ot");
    await expect(page.getByRole("heading", { level: 1, name: "OT approvals" })).toBeVisible();

    await page.getByRole("button", { name: "New OT request" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("combobox", { name: "Employee" }).click();
    await page.getByRole("option", { name: new RegExp(LAST_NAME) }).click();

    // One weekday evening: 18:00–21:00 is the 3 hours she asks for.
    await drawer.getByLabel("Work date").fill(today);
    await drawer.getByLabel("Start time").fill("18:00");
    await drawer.getByLabel("End time").fill("21:00");
    await drawer.getByRole("combobox", { name: "Rate type" }).click();
    await page.getByRole("option", { name: /Weekday/ }).click();
    await drawer.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText("OT request submitted for approval.")).toBeVisible();

    // Lands in the approval queue as SUBMITTED. The chip gets no explicit label, so it renders
    // the ChipStatus default — SUBMITTED maps to `pending`, which reads "Pending" (hr/chip-status.ts).
    const row = page.getByRole("row").filter({ hasText: LAST_NAME });
    await expect(row).toContainText("Pending");
    await row.getByRole("button", { name: "Row actions" }).click();
    // Wait for the approval to land before reading the row: the list refetches on success, so
    // asserting straight after the click races the re-render.
    const approved = page.waitForResponse(
      (r) => r.url().includes("/approve") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Approve" }).click();
    expect((await approved).status()).toBeLessThan(400);
    // Assert the durable state, not the toast: toasts auto-dismiss and raced this check.
    await expect(page.getByRole("row").filter({ hasText: LAST_NAME })).toContainText("Approved");
  });

  test("UAT-J2-03 OT reconciled against attendance: 3h asked, 2h worked, 2h paid", async ({
    page,
  }) => {
    // ---- record the hours actually worked -------------------------------------------------
    // Attendance is ingested, not hand-keyed: the contract has no single-record write and
    // `attendance.source` defaults to IMPORT, modelling it as time-clock data. Columns are
    // POSITIONAL (emp_code, work_date, clock_in, clock_out) — the header is skipped only when
    // cell 1 is a known token. Attended hours are the whole clocked span, so 18:00–20:00 is the
    // 2 hours she actually stayed, against the 3 she requested.
    await page.goto("/hr/attendance");
    await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();
    const imported = page.waitForResponse(
      (r) => r.url().includes("/attendance/import") && r.request().method() === "POST",
    );
    await page.getByLabel("Import attendance").setInputFiles({
      name: "attendance.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `emp_code,work_date,clock_in,clock_out\n${empCode},${today},${today}T18:00:00,${today}T20:00:00\n`,
      ),
    });
    expect((await imported).status()).toBe(200);

    // ---- reconcile: the system pays the attended hours, not the requested ones -------------
    await page.goto("/hr/ot");
    const row = page.getByRole("row").filter({ hasText: LAST_NAME });
    await expect(row).toContainText("Approved");

    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "Reconcile" }).click();

    // RECONCILED maps to the `posted` ChipStatus, which renders "Posted" (hr/chip-status.ts).
    const settled = page.getByRole("row").filter({ hasText: LAST_NAME });
    await expect(settled).toContainText("Posted");

    // The acceptance criterion: min(requested 3, attended 2) = 2 payable hours. Scoped to the
    // Approved hours cell — row text concatenates ("WEEKDAY_1_5" + "2.000000"), so a substring
    // match there would be meaningless.
    // Columns: 0 Employee · 1 Work date · 2 Time · 3 Rate type · 4 Approved hours · 5 Status.
    await expect(settled.getByRole("gridcell").nth(4)).toHaveText(/^2(\.0+)?$/);
  });

  test("UAT-J2-04/05 payroll calculated, reviewed, approved under guard, and not twice", async ({
    page,
  }) => {
    // A period is unique per run, so give this run its own rather than colliding with a real one.
    const period = `2${RUN.slice(0, 3)}-01`;

    await page.goto("/hr/payroll");
    await expect(page.getByRole("heading", { level: 1, name: "Payroll" })).toBeVisible();
    await page.getByLabel("New run period").fill(period);
    await page.getByRole("button", { name: "Create run" }).click();

    // Creating a run navigates straight into its wizard (payroll-runs-list.tsx), so there is no
    // list row to open. The heading renders the period formatted, e.g. "January 2585".
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

    // ---- Inputs: every other employee is excluded ------------------------------------------
    // The run scopes ALL employees, and earlier runs leave hires behind with no salary record —
    // each one a blocking "Missing salary" flag. Excluding everyone but this journey's employee
    // makes the run deterministic on a database that has accumulated state, which is the normal
    // local case (CI gets a fresh one).
    const excludes = page.getByRole("checkbox", { name: /^Exclude / });
    await expect(excludes.first()).toBeVisible();
    const names = await excludes.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? ""),
    );
    for (const name of names) {
      if (name.includes(LAST_NAME)) continue;
      const box = page.getByRole("checkbox", { name, exact: true });
      if ((await box.getAttribute("aria-checked")) !== "true") await box.click();
    }

    // With only a fully-prepared employee in scope there is nothing left to resolve.
    await expect(page.getByText("No missing data — ready to calculate.")).toBeVisible();
    await page.getByRole("button", { name: "Continue to calculate" }).click();

    // ---- Calculate -------------------------------------------------------------------------
    const calculated = page.waitForResponse(
      (r) => r.url().includes("/calculate") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Run calculation" }).click();
    expect((await calculated).status()).toBeLessThan(400);
    // Calculation is asynchronous — `usePayslipsQuery` polls while the run's payslips are still
    // empty, and Continue only enables once they land. Well past the 7s default.
    await expect(page.getByRole("button", { name: "Continue to review" })).toBeEnabled({
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Continue to review" }).click();

    // ---- Review: the payslip breakdown, line by line ----------------------------------------
    const payslipRow = page.getByRole("row").filter({ hasText: LAST_NAME });
    await expect(payslipRow).toBeVisible();
    await payslipRow.getByRole("button", { name: "View breakdown" }).click();

    const breakdown = page.getByRole("dialog");
    await expect(breakdown.getByText("Base salary")).toBeVisible();
    await expect(breakdown.getByText("Overtime")).toBeVisible();
    await expect(breakdown.getByText("Social security")).toBeVisible();
    await expect(breakdown.getByText("Withholding tax")).toBeVisible();
    await expect(breakdown.getByText("Net", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    // ---- UAT-J2-05: guarded approval, then refusal of a second one --------------------------
    await page.getByRole("button", { name: "Continue to approve" }).click();
    const approved = page.waitForResponse(
      (r) => r.url().includes("/approve") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Approve payroll" }).first().click();

    // The guard asks for explicit confirmation before locking the run. Its subject is the
    // FORMATTED period ("January 2432"), not the raw YYYY-MM the run was created with.
    await expect(page.getByText(/Approve payroll run .+\?/)).toBeVisible();
    await page.getByRole("button", { name: "Approve payroll", exact: true }).last().click();
    expect((await approved).status()).toBeLessThan(400);

    // Approving again must be REFUSED — the run is already APPROVED. The wizard still offers
    // the action (it does not retire on lock), so the guarantee is the server's: `approve`
    // throws StateConflictError on a non-CALCULATED run, i.e. 409. Asserted on the response
    // because `onApprove` has no catch, so the refusal never reaches the user as a message —
    // a gap worth its own fix, but not one this spec should paper over.
    const refused = page.waitForResponse(
      (r) => r.url().includes("/approve") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Approve payroll" }).first().click();
    await page.getByRole("button", { name: "Approve payroll", exact: true }).last().click();
    expect((await refused).status()).toBe(409);
  });
});
