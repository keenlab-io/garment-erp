import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./confirm-dialog";

function Harness(props: Partial<React.ComponentProps<typeof ConfirmDialog>>) {
  const [open, setOpen] = React.useState(true);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Void invoice QV20260042?"
      consequence="This voids invoice QV20260042 and posts a reversing stock entry."
      onConfirm={() => {}}
      {...props}
    />
  );
}

describe("ConfirmDialog", () => {
  it("states the consequence with the record id", () => {
    render(<Harness />);
    expect(
      screen.getByText("This voids invoice QV20260042 and posts a reversing stock entry."),
    ).toBeInTheDocument();
  });

  it("blocks submit and shows an inline error when a required reason is blank", async () => {
    const onConfirm = vi.fn();
    render(<Harness requireReason onConfirm={onConfirm} confirmLabel="Void" />);
    await userEvent.click(screen.getByRole("button", { name: "Void" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("A reason is required.")).toBeInTheDocument();
  });

  it("submits the reason once provided", async () => {
    const onConfirm = vi.fn();
    render(<Harness requireReason onConfirm={onConfirm} confirmLabel="Void" />);
    await userEvent.type(screen.getByPlaceholderText("Explain why"), "Duplicate document");
    await userEvent.click(screen.getByRole("button", { name: "Void" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Duplicate document", password: undefined });
  });

  it("keeps confirm disabled until the re-auth password is entered", async () => {
    const onConfirm = vi.fn();
    render(<Harness requirePassword onConfirm={onConfirm} confirmLabel="Delete" />);
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("Re-enter to authorize"), "s3cret");
    expect(confirm).toBeEnabled();
  });

  it("keeps confirm disabled when confirmDisabled is set, regardless of reason/password state", () => {
    render(<Harness confirmDisabled confirmLabel="Void" />);
    expect(screen.getByRole("button", { name: "Void" })).toBeDisabled();
  });

  it("falls back to the `common` namespace defaults when confirm/cancel labels aren't overridden (M0 §7)", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
