import { test, expect } from "@playwright/test";

/**
 * HR & Payroll — UAT journey J2 "Hire to Payslip" (docs/uat/journeys/J2-hire-to-payslip.md).
 * Ms. Suda joins on ฿30,000/month, works overtime the system must pay at attended hours,
 * and payroll is run and approved under guard.
 *
 * Each run onboards a NEW employee (unique surname): creation does not navigate anywhere, so the
 * spec has to find its own row in the list, and a fixed name would collide across runs.
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
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("OT request approved.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: LAST_NAME })).toContainText("Approved");
  });

  // ---------------------------------------------------------------------------------------
  // UAT-J2-03/04/05 are BLOCKED — no UI path exists, so they are skipped rather than faked.
  //
  // `reconcileOtRequest` is in the contract (POST /ot-requests/:id/reconcile) and a hook exists
  // (`useReconcileOtRequestMutation`, hr/queries.ts:189) — but NOTHING calls it. The Attendance
  // screen is read-only plus a CSV import; the only "Reconcile" strings in the app belong to
  // stock counts. So an approved OT request can never reach RECONCILED through the screens.
  //
  // That blocks payroll too: `payroll-wizard.tsx` sets `canCalculate = blocking.length === 0`
  // where blocking includes anyone with `unreconciledOt`. Suda therefore either blocks Calculate
  // or has to be excluded from the run — and an excluded employee has no payslip, which is what
  // UAT-J2-04 asserts on.
  //
  // These skip (not pass) so the gap stays visible in every report, and they become executable
  // the moment the reconcile action is wired to a screen.
  // ---------------------------------------------------------------------------------------

  test("UAT-J2-03 OT reconciled against attendance: 3h asked, 2h worked, 2h paid", async () => {
    test.skip(
      true,
      "No UI path: reconcileOtRequest is contracted and hooked but no screen calls it, and the " +
        "Attendance screen only imports CSV. KNOWN GAP — see this file's header.",
    );
  });

  test("UAT-J2-04 payroll calculated and the payslip breakdown reviewed", async () => {
    test.skip(
      true,
      "Blocked by UAT-J2-03: unreconciled OT is a blocking flag in payroll-wizard.tsx, so the " +
        "run cannot Calculate with Suda in scope, and excluding her removes the payslip under test.",
    );
  });

  test("UAT-J2-05 payroll approved under guard; approving twice is refused", async () => {
    test.skip(true, "Blocked by UAT-J2-04 — the run never reaches an approvable state.");
  });
});
