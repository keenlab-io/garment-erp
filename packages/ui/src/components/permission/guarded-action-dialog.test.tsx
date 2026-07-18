import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PermissionsProvider } from "./permissions-context";
import { GuardedActionDialog, type GuardedActionDialogProps } from "./guarded-action-dialog";

function Harness(props: Partial<GuardedActionDialogProps> & { kind: GuardedActionDialogProps["kind"] }) {
  const [open, setOpen] = React.useState(true);
  return (
    <GuardedActionDialog open={open} onOpenChange={setOpen} subject="QV20260042" onConfirm={() => {}} {...props} />
  );
}

describe("GuardedActionDialog", () => {
  it("names the invoice number in its consequence and blocks confirmation until a reason is entered (document-void)", async () => {
    const onConfirm = vi.fn();
    render(
      <PermissionsProvider permissions={["sales.document.void"]} isSuperAdmin={false}>
        <Harness kind="document-void" onConfirm={onConfirm} />
      </PermissionsProvider>,
    );
    expect(screen.getByText("This voids QV20260042 and cannot be undone.")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Void" });
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("A reason is required.")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Explain why"), "Duplicate document");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Duplicate document", password: undefined });
  });

  it("requires a re-auth password before confirming force-logout", async () => {
    const onConfirm = vi.fn();
    render(
      <PermissionsProvider permissions={["iam.user.force_logout"]} isSuperAdmin={false}>
        <Harness kind="force-logout" subject="jane@example.com" onConfirm={onConfirm} />
      </PermissionsProvider>,
    );
    const confirm = screen.getByRole("button", { name: "Force logout" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("Re-enter to authorize"), "s3cret");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ reason: undefined, password: "s3cret" });
  });

  it("requires a re-auth password before confirming role-delete", async () => {
    render(
      <PermissionsProvider permissions={["iam.role.manage"]} isSuperAdmin={false}>
        <Harness kind="role-delete" subject="Warehouse Clerk" />
      </PermissionsProvider>,
    );
    expect(screen.getByRole("button", { name: "Delete role" })).toBeDisabled();
  });

  it("requires a reason before confirming a stock adjustment", () => {
    render(
      <PermissionsProvider permissions={["inventory.adjustment.approve"]} isSuperAdmin={false}>
        <Harness kind="stock-adjustment" subject="ADJ-0007" />
      </PermissionsProvider>,
    );
    expect(screen.getByPlaceholderText("Explain why")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Re-enter to authorize")).not.toBeInTheDocument();
  });

  it("needs neither reason nor password for a payroll approval, but still gates on permission", () => {
    render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <Harness kind="payroll-approve" subject="2026-07" />
      </PermissionsProvider>,
    );
    expect(screen.queryByPlaceholderText("Explain why")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Re-enter to authorize")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve payroll" })).toBeDisabled();
  });

  it("disables confirm when the viewer lacks the preset's permission, even without reason/password", () => {
    render(
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <Harness kind="payroll-approve" subject="2026-07" />
      </PermissionsProvider>,
    );
    expect(screen.getByRole("button", { name: "Approve payroll" })).toBeDisabled();
  });

  it("enables confirm for a permitted payroll approval", async () => {
    const onConfirm = vi.fn();
    render(
      <PermissionsProvider permissions={["hr.payroll.approve"]} isSuperAdmin={false}>
        <Harness kind="payroll-approve" subject="2026-07" onConfirm={onConfirm} />
      </PermissionsProvider>,
    );
    const confirm = screen.getByRole("button", { name: "Approve payroll" });
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ reason: undefined, password: undefined });
  });
});
