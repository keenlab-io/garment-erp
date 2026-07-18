import { render, screen } from "@testing-library/react";
import { PermissionsProvider } from "./permissions-context";
import { HasPermission, withPermission } from "./has-permission";

function Gated({ label }: { label: string }) {
  return <span>{label}</span>;
}

describe("HasPermission", () => {
  it("renders children when the viewer holds the required permission", () => {
    render(
      <PermissionsProvider permissions={["sales.invoice.create"]} isSuperAdmin={false}>
        <HasPermission required="sales.invoice.create">
          <span>Create invoice</span>
        </HasPermission>
      </PermissionsProvider>,
    );
    expect(screen.getByText("Create invoice")).toBeInTheDocument();
  });

  it("renders the fallback (not the children) when the permission is absent", () => {
    render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <HasPermission required="sales.invoice.create" fallback={<span>Locked</span>}>
          <span>Create invoice</span>
        </HasPermission>
      </PermissionsProvider>,
    );
    expect(screen.queryByText("Create invoice")).not.toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("renders nothing by default when the permission is absent", () => {
    render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <div data-testid="wrap">
          <HasPermission required="sales.invoice.create">
            <span>Create invoice</span>
          </HasPermission>
        </div>
      </PermissionsProvider>,
    );
    expect(screen.getByTestId("wrap")).toBeEmptyDOMElement();
  });

  it("matches any-of when required is a list", () => {
    render(
      <PermissionsProvider permissions={["hr.employee.view"]} isSuperAdmin={false}>
        <HasPermission required={["hr.employee.manage", "hr.employee.view"]}>
          <span>HR entry</span>
        </HasPermission>
      </PermissionsProvider>,
    );
    expect(screen.getByText("HR entry")).toBeInTheDocument();
  });

  it("grants a super admin with an empty set", () => {
    render(
      <PermissionsProvider permissions={[]} isSuperAdmin>
        <HasPermission required="iam.role.manage">
          <span>Manage roles</span>
        </HasPermission>
      </PermissionsProvider>,
    );
    expect(screen.getByText("Manage roles")).toBeInTheDocument();
  });
});

describe("withPermission", () => {
  it("gates the wrapped component the same as <HasPermission>", () => {
    const GatedComponent = withPermission(Gated, "sales.invoice.create", <span>No access</span>);

    const { rerender } = render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <GatedComponent label="Create invoice" />
      </PermissionsProvider>,
    );
    expect(screen.getByText("No access")).toBeInTheDocument();

    rerender(
      <PermissionsProvider permissions={["sales.invoice.create"]} isSuperAdmin={false}>
        <GatedComponent label="Create invoice" />
      </PermissionsProvider>,
    );
    expect(screen.getByText("Create invoice")).toBeInTheDocument();
  });
});
