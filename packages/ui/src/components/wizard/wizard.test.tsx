import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Wizard, WizardNav, type WizardStep } from "./wizard";

const STEPS: WizardStep[] = [
  { key: "lines", label: "Lines" },
  { key: "landed-cost", label: "Landed cost" },
  { key: "confirm", label: "Confirm" },
];

describe("Wizard", () => {
  it("marks the current step and steps before it as done", () => {
    render(<Wizard steps={STEPS} activeStep="landed-cost" onStepChange={() => {}} />);
    expect(screen.getByRole("button", { name: /landed cost/i })).toHaveAttribute("aria-current", "step");
  });

  it("lets the caller jump back to an already-visited step", () => {
    const onStepChange = vi.fn();
    render(<Wizard steps={STEPS} activeStep="confirm" onStepChange={onStepChange} />);
    fireEvent.click(screen.getByRole("button", { name: /lines/i }));
    expect(onStepChange).toHaveBeenCalledWith("lines");
  });

  it("disables steps ahead of the active one — forward progress isn't a header click", () => {
    const onStepChange = vi.fn();
    render(<Wizard steps={STEPS} activeStep="lines" onStepChange={onStepChange} />);
    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    expect(confirmButton).toBeDisabled();
    fireEvent.click(confirmButton);
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("renders the caller's per-step content in the body slot", () => {
    render(
      <Wizard steps={STEPS} activeStep="lines" onStepChange={() => {}}>
        <p>Add receipt lines</p>
      </Wizard>,
    );
    expect(screen.getByText("Add receipt lines")).toBeInTheDocument();
  });
});

describe("WizardNav", () => {
  it("gates Continue on the per-step validation flag", () => {
    const onContinue = vi.fn();
    render(<WizardNav onContinue={onContinue} continueDisabled />);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
  });

  it("calls onBack / onContinue and supports a custom continue label", () => {
    const onBack = vi.fn();
    const onContinue = vi.fn();
    render(<WizardNav onBack={onBack} onContinue={onContinue} continueLabel="Post" />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
