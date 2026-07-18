import { render, screen } from "@testing-library/react";
import { PermissionsProvider } from "./permissions-context";
import { MaskedValue } from "./masked-value";

const SECRET = "฿1,234.56";

describe("MaskedValue", () => {
  it("renders the real value when the viewer holds the gating permission", () => {
    render(
      <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
        <MaskedValue permission="inventory.cost.view" value={SECRET} />
      </PermissionsProvider>,
    );
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.queryByText("••••")).not.toBeInTheDocument();
  });

  it("masks the value and never places it in the DOM when the permission is absent", () => {
    const { container } = render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <MaskedValue permission="inventory.cost.view" value={SECRET} />
      </PermissionsProvider>,
    );
    expect(screen.getByText("••••")).toBeInTheDocument();
    expect(container.textContent).not.toContain(SECRET);
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it("exposes an accessible description naming the required permission when masked", () => {
    render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <MaskedValue permission="hr.salary.view" value={SECRET} />
      </PermissionsProvider>,
    );
    expect(screen.getByText("Restricted — requires hr.salary.view")).toHaveClass("sr-only");
  });

  it("keeps the same wrapper structure whether masked or revealed (stable layout)", () => {
    const { container: revealed } = render(
      <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
        <MaskedValue permission="inventory.cost.view" value={SECRET} className="my-slot" />
      </PermissionsProvider>,
    );
    const { container: masked } = render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <MaskedValue permission="inventory.cost.view" value={SECRET} className="my-slot" />
      </PermissionsProvider>,
    );
    const revealedWrapper = revealed.firstElementChild as HTMLElement;
    const maskedWrapper = masked.firstElementChild as HTMLElement;
    expect(revealedWrapper.className).toBe(maskedWrapper.className);
    expect(revealedWrapper.tagName).toBe(maskedWrapper.tagName);
  });

  it("grants a super admin regardless of the permission set", () => {
    render(
      <PermissionsProvider permissions={[]} isSuperAdmin>
        <MaskedValue permission="inventory.cost.view" value={SECRET} />
      </PermissionsProvider>,
    );
    expect(screen.getByText(SECRET)).toBeInTheDocument();
  });
});
