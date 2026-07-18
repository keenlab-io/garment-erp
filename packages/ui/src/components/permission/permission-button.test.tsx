import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "../tooltip/tooltip";
import { PermissionsProvider } from "./permissions-context";
import { PermissionButton } from "./permission-button";

describe("PermissionButton", () => {
  it("renders a fully interactive button when the permission is granted", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <PermissionsProvider permissions={["sales.document.void"]} isSuperAdmin={false}>
          <PermissionButton required="sales.document.void" onClick={onClick}>
            Void
          </PermissionButton>
        </PermissionsProvider>
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "Void" });
    expect(button).not.toHaveAttribute("aria-disabled");
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("marks the action aria-disabled and swallows its click when denied", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <PermissionsProvider permissions={[]} isSuperAdmin={false}>
          <PermissionButton required="sales.document.void" onClick={onClick}>
            Void
          </PermissionButton>
        </PermissionsProvider>
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "Void" });
    expect(button).toHaveAttribute("aria-disabled", "true");

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("names the required permission in its tooltip when denied", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <PermissionsProvider permissions={[]} isSuperAdmin={false}>
          <PermissionButton required="sales.document.void">Void</PermissionButton>
        </PermissionsProvider>
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole("button", { name: "Void" }));
    expect(await screen.findAllByText("Requires sales.document.void")).not.toHaveLength(0);
  });

  it("grants a super admin regardless of the permission set", () => {
    render(
      <TooltipProvider delayDuration={0}>
        <PermissionsProvider permissions={[]} isSuperAdmin>
          <PermissionButton required="sales.document.void">Void</PermissionButton>
        </PermissionsProvider>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Void" })).not.toHaveAttribute("aria-disabled");
  });
});
