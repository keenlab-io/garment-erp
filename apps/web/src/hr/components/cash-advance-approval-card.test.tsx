import type { ComponentProps } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { PermissionsProvider, TooltipProvider } from "@erp/ui";
import i18n from "../../i18n/i18n";
import { CashAdvanceApprovalCard } from "./cash-advance-approval-card";

function renderCard(
  props: Partial<ComponentProps<typeof CashAdvanceApprovalCard>> = {},
  { isSuperAdmin = true }: { isSuperAdmin?: boolean } = {},
) {
  const onApprove = vi.fn();
  const onReject = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin={isSuperAdmin}>
          <CashAdvanceApprovalCard
            employeeName="Somchai Jaidee"
            amount="4500.00"
            ceiling="10000.00"
            reason="Motorbike repair"
            status="SUBMITTED"
            onApprove={onApprove}
            onReject={onReject}
            {...props}
          />
        </PermissionsProvider>
      </TooltipProvider>
    </I18nextProvider>,
  );
  return { onApprove, onReject };
}

describe("CashAdvanceApprovalCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows employee, amount, reason, and the ceiling badge", () => {
    renderCard();
    expect(screen.getByText("Somchai Jaidee")).toBeInTheDocument();
    expect(screen.getByText("Motorbike repair")).toBeInTheDocument();
    expect(screen.getByText("Within ceiling")).toBeInTheDocument();
  });

  it("masks the amount without hr.salary.view", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <PermissionsProvider permissions={[]} isSuperAdmin={false}>
            <CashAdvanceApprovalCard
              employeeName="Somchai Jaidee"
              amount="4500.00"
              ceiling="10000.00"
              status="SUBMITTED"
              onApprove={vi.fn()}
              onReject={vi.fn()}
            />
          </PermissionsProvider>
        </TooltipProvider>
      </I18nextProvider>,
    );
    expect(screen.getByText("••••")).toBeInTheDocument();
    expect(screen.queryByText("฿4,500.00")).not.toBeInTheDocument();
  });

  it("disables approve for a non-super-admin viewer", () => {
    renderCard({}, { isSuperAdmin: false });
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("requires re-auth password before approving", async () => {
    const user = userEvent.setup();
    const { onApprove } = renderCard();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    const dialog = within(screen.getByRole("dialog"));
    const dialogConfirm = dialog.getByRole("button", { name: "Approve" });
    expect(dialogConfirm).toBeDisabled();

    await user.type(dialog.getByLabelText(/^Super-Admin password/), "super-secret");
    expect(dialogConfirm).toBeEnabled();
    await user.click(dialogConfirm);
    expect(onApprove).toHaveBeenCalledWith("super-secret");
  });

  it("requires a reason before rejecting", async () => {
    const user = userEvent.setup();
    const { onReject } = renderCard();

    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = within(screen.getByRole("dialog"));
    const dialogConfirm = dialog.getByRole("button", { name: "Reject" });
    await user.click(dialogConfirm);
    expect(onReject).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText(/^Reason/), "Ceiling exceeded");
    await user.click(dialogConfirm);
    expect(onReject).toHaveBeenCalledWith("Ceiling exceeded");
  });
});
