import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionsProvider } from "@erp/ui";
import { PayslipBreakdownDrawer, type PayslipLine } from "./payslip-breakdown-drawer";

const LINES: PayslipLine[] = [
  { key: "base", label: "Base salary", amount: "18000.00", kind: "earning" },
  { key: "sso", label: "Social security", amount: "-750.00", kind: "deduction" },
  { key: "net", label: "Net pay", amount: "17250.00", kind: "net" },
];

describe("PayslipBreakdownDrawer", () => {
  it("lists every formula line with its label", () => {
    render(
      <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin={false}>
        <PayslipBreakdownDrawer
          open
          onOpenChange={() => {}}
          employeeName="Somchai Jaidee"
          period="2026-07"
          lines={LINES}
        />
      </PermissionsProvider>,
    );
    expect(screen.getByText("Base salary")).toBeInTheDocument();
    expect(screen.getByText("Social security")).toBeInTheDocument();
    expect(screen.getByText("Net pay")).toBeInTheDocument();
    expect(screen.getByText("฿18,000.00")).toBeInTheDocument();
    expect(screen.getByText("(฿750.00)")).toBeInTheDocument();
  });

  it("masks every amount without hr.salary.view", () => {
    const { container } = render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <PayslipBreakdownDrawer
          open
          onOpenChange={() => {}}
          employeeName="Somchai Jaidee"
          period="2026-07"
          lines={LINES}
        />
      </PermissionsProvider>,
    );
    expect(container.textContent).not.toContain("18,000.00");
    expect(screen.getAllByText("••••")).toHaveLength(LINES.length);
  });

  it("does not render when closed", () => {
    render(
      <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin={false}>
        <PayslipBreakdownDrawer
          open={false}
          onOpenChange={() => {}}
          employeeName="Somchai Jaidee"
          period="2026-07"
          lines={LINES}
        />
      </PermissionsProvider>,
    );
    expect(screen.queryByText("Net pay")).not.toBeInTheDocument();
  });
});
