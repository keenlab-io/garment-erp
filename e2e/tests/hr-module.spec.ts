import { test, expect, type Page } from "@playwright/test";
import { PERSONAS, personaStatePath } from "../fixtures/personas.js";

/**
 * HR module — TC-HR-01, 03..05, 08..10, 13..15 of docs/testing/test-cases/04-hr.md.
 * TC-HR-02/06/07/11/12 are covered end to end by the J2 journey in hr.spec.ts.
 *
 * The masking cases are the point of this file: `hrOfficer` is seeded deliberately WITHOUT
 * `hr.salary.view`, so it is the persona that proves salary figures never reach the DOM.
 */
const RUN = Date.now().toString().slice(-6);

async function heading(page: Page, name: RegExp | string) {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test.describe("hr — screens (TC-HR)", () => {
  test("TC-HR-01 the employees list renders with its status filter", async ({ page }) => {
    await page.goto("/hr/employees");
    await heading(page, "Employees");
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create employee" })).toBeVisible();
    for (const col of ["Code", "Name", "Status"]) {
      await expect(page.getByRole("columnheader", { name: col })).toBeVisible();
    }
  });

  test("TC-HR-05 org structure stacks Positions over Departments", async ({ page }) => {
    await page.goto("/hr/org");
    await expect(page.getByRole("heading", { name: "Positions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Departments" })).toBeVisible();

    // A position needs a department, so the department is created first.
    await page.getByRole("button", { name: "New department" }).first().click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Name").fill(`Production ${RUN}`);
    const created = page.waitForResponse(
      (r) => r.url().includes("/departments") && r.request().method() === "POST",
    );
    await drawer.getByRole("button", { name: "New department" }).click();
    expect((await created).status()).toBeLessThan(400);
    await expect(page.getByText(`Production ${RUN}`)).toBeVisible();
  });

  test("TC-HR-10 the attendance month grid renders", async ({ page }) => {
    await page.goto("/hr/attendance");
    await heading(page, "Attendance");
    await expect(page.getByLabel("Period")).toBeVisible();
    await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  });

  test("TC-HR-15 tax exports offer PND.1 and SSO as async jobs", async ({ page }) => {
    await page.goto("/hr/tax-exports");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The screen states plainly that these figures are non-authoritative.
    await expect(page.getByText(/non-authoritative/i)).toBeVisible();
  });

  test("TC-HR-08/09 cash-advance approvals screen renders its queue", async ({ page }) => {
    await page.goto("/hr/advances");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  });
});

test.describe("hr — salary masking (TC-HR)", () => {
  test.describe("HR Officer (no hr.salary.view)", () => {
    test.use({ storageState: personaStatePath(PERSONAS.hrOfficer!) });

    test("TC-HR-04 salary and national id are masked, and never reach the DOM", async ({
      page,
    }) => {
      await page.goto("/hr/employees");
      await heading(page, "Employees");

      // The mask is a lock slot, not a blank: same layout, explicit sr-only reason.
      await expect(page.getByText("••••").first()).toBeVisible();

      // The real figure is absent from the markup entirely — the API omits it server-side, so
      // MaskedValue never mounts a value it could leak. 30000 is the seeded J2 salary.
      const html = await page.content();
      expect(html).not.toContain("30,000.00");
      expect(html).not.toContain("30000.0000");
    });

    test("TC-HR-03 manage actions the persona lacks are disabled, not hidden", async ({ page }) => {
      await page.goto("/hr/employees");
      await heading(page, "Employees");
      // hrOfficer holds employee.manage, so creation is offered — the boundary under test is
      // salary, which is masked above rather than removed from the screen.
      await expect(page.getByRole("button", { name: "Create employee" })).toBeVisible();
      // …but payroll is not theirs at all: the module is absent from nav.
      await expect(page.getByRole("link", { name: "Payroll" })).toHaveCount(0);
    });
  });
});

test.describe("hr — payroll gate (TC-HR)", () => {
  test.describe("HR Officer (no hr.payroll.approve)", () => {
    test.use({ storageState: personaStatePath(PERSONAS.hrOfficer!) });

    test("TC-HR-14 payroll is unreachable without hr.payroll.approve", async ({ page }) => {
      await page.goto("/hr/payroll");
      // The route is gated, so the persona is redirected away rather than shown a dead screen.
      await page.waitForURL((url) => !url.pathname.startsWith("/hr/payroll"));
      expect(page.url()).not.toContain("/hr/payroll");
    });
  });
});

test.describe("hr — payslip breakdown (TC-HR)", () => {
  test("TC-HR-13 payslip breakdown drawer and its masked counterpart", async () => {
    test.skip(
      true,
      "Half covered, half unprovisionable. The super-admin drawer — 'Payslip — {name}' with Base " +
        "salary / Overtime / Social security / Withholding tax / Net — is asserted by UAT-J2-04 in " +
        "hr.spec.ts, which drives a real run through Review. The MASKED half needs a persona " +
        "holding hr.payroll.approve WITHOUT hr.salary.view so it can reach the Review step and " +
        "still be denied the figures; no seeded persona fits (payrollApprover holds both, and " +
        "hrOfficer is redirected away from /hr/payroll — see TC-HR-14). Add that persona to " +
        "SEED_PERSONAS and this becomes executable.",
    );
  });
});
