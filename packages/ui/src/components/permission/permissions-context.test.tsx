import { render, screen } from "@testing-library/react";
import type { Permission } from "@erp/contracts";
import { PermissionsProvider, usePermissions } from "./permissions-context";

function Probe({ check }: { check: Permission }) {
  const { has } = usePermissions();
  return <span>{has(check) ? "granted" : "denied"}</span>;
}

describe("PermissionsProvider / usePermissions", () => {
  it("throws when used outside a provider", () => {
    // Swallow the expected React error-boundary console noise for this one assertion.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe check="sales.invoice.create" />)).toThrow(
      "usePermissions must be used within a <PermissionsProvider>",
    );
    spy.mockRestore();
  });

  it.each<{
    name: string;
    isSuperAdmin: boolean;
    permissions: Permission[];
    check: Permission;
    expected: "granted" | "denied";
  }>([
    {
      name: "grants a permission in the set",
      isSuperAdmin: false,
      permissions: ["inventory.issue.manage"],
      check: "inventory.issue.manage",
      expected: "granted",
    },
    {
      name: "denies a permission outside the set",
      isSuperAdmin: false,
      permissions: ["inventory.issue.manage"],
      check: "sales.invoice.create",
      expected: "denied",
    },
    {
      name: "denies everything with an empty set",
      isSuperAdmin: false,
      permissions: [],
      check: "iam.role.manage",
      expected: "denied",
    },
    {
      name: "grants everything to a super admin, even with an empty set",
      isSuperAdmin: true,
      permissions: [],
      check: "hr.payroll.approve",
      expected: "granted",
    },
    {
      name: "grants everything to a super admin regardless of the set's contents",
      isSuperAdmin: true,
      permissions: ["sales.invoice.create"],
      check: "iam.user.force_logout",
      expected: "granted",
    },
  ])("$name", ({ isSuperAdmin, permissions, check, expected }) => {
    render(
      <PermissionsProvider permissions={permissions} isSuperAdmin={isSuperAdmin}>
        <Probe check={check} />
      </PermissionsProvider>,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
