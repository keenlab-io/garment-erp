import type { ComponentProps } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import type { Permission } from "@erp/contracts";
import { PermissionsProvider, TooltipProvider } from "@erp/ui";
import i18n from "../../i18n/i18n";
import { PayrollWizard, type PayrollScopeEmployee, type PayslipPreviewRow } from "./payroll-wizard";

const SCOPE: PayrollScopeEmployee[] = [
  { id: "e1", name: "Somchai Jaidee" },
  { id: "e2", name: "Suda Boonmee", missingSalary: true },
];

const PAYSLIPS: PayslipPreviewRow[] = [
  {
    id: "p1",
    employeeId: "e1",
    employeeName: "Somchai Jaidee",
    base: "18000.00",
    ot: "0",
    allowances: "0",
    deductions: "0",
    sso: "0",
    tax: "0",
    advance: "0",
    net: "17480.00",
  },
  {
    id: "p2",
    employeeId: "e2",
    employeeName: "Suda Boonmee",
    base: "15000.00",
    ot: "0",
    allowances: "0",
    deductions: "0",
    sso: "0",
    tax: "0",
    advance: "0",
    net: "-500.00",
  },
];

function renderWizard(
  overrides: Partial<ComponentProps<typeof PayrollWizard>> = {},
  { isSuperAdmin = false, permissions = ["hr.salary.view"] as Permission[] } = {},
) {
  const handlers = {
    onStepChange: vi.fn(),
    onToggleExclude: vi.fn(),
    onCalculate: vi.fn(),
    onOpenBreakdown: vi.fn(),
    onApprove: vi.fn(),
  };
  render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <PermissionsProvider permissions={permissions} isSuperAdmin={isSuperAdmin}>
          <PayrollWizard
            period="2026-07"
            status="DRAFT"
            step="inputs"
            scope={SCOPE}
            excludedEmployeeIds={[]}
            payslips={[]}
            {...handlers}
            {...overrides}
          />
        </PermissionsProvider>
      </TooltipProvider>
    </I18nextProvider>,
  );
  return handlers;
}

describe("PayrollWizard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("blocks calculation while an employee in scope has missing data", () => {
    renderWizard();
    expect(screen.getByText("Resolve or exclude the flagged employees before calculating.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to calculate" })).toBeDisabled();
  });

  it("unblocks once the flagged employee is excluded", () => {
    renderWizard({ excludedEmployeeIds: ["e2"] });
    expect(screen.getByText("No missing data — ready to calculate.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to calculate" })).toBeEnabled();
  });

  it("flags an outlier payslip (net ≤ 0) but not a normal one in review", () => {
    renderWizard({ step: "review", payslips: PAYSLIPS });
    const suda = screen.getByText("Suda Boonmee").closest("tr")!;
    const somchai = screen.getByText("Somchai Jaidee").closest("tr")!;
    expect(suda.textContent).toContain("Outlier");
    expect(somchai.textContent).not.toContain("Outlier");
  });

  it("requires hr.payroll.approve to trigger the guarded approve dialog", async () => {
    const user = userEvent.setup();
    renderWizard({ step: "approve", payslips: PAYSLIPS }, { permissions: ["hr.salary.view"] });
    const approveButton = screen.getByRole("button", { name: "Approve payroll" });
    expect(approveButton).toHaveAttribute("aria-disabled", "true");
    await user.click(approveButton);
    expect(screen.queryByText(/locks payroll run/i)).not.toBeInTheDocument();
  });

  it("states the approve consequence and confirms once permitted", async () => {
    const user = userEvent.setup();
    const handlers = renderWizard(
      { step: "approve", payslips: PAYSLIPS },
      { permissions: ["hr.salary.view", "hr.payroll.approve"] },
    );
    await user.click(screen.getByRole("button", { name: "Approve payroll" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.getByText(/locks payroll run 2026-07.*pulls outstanding advances.*generates payslips/i),
    ).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Approve payroll" }));
    expect(handlers.onApprove).toHaveBeenCalled();
  });
});
