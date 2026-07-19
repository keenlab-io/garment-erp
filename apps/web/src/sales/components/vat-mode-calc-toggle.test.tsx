import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VatApplicability, VatMode } from "@erp/contracts";
import { VatModeCalcToggle } from "./vat-mode-calc-toggle";

function Harness() {
  const [vatMode, setVatMode] = React.useState<VatApplicability>(VatApplicability.VAT);
  const [vatCalc, setVatCalc] = React.useState<VatMode>(VatMode.VatNok);
  return (
    <VatModeCalcToggle vatMode={vatMode} onVatModeChange={setVatMode} vatCalc={vatCalc} onVatCalcChange={setVatCalc} />
  );
}

describe("VatModeCalcToggle", () => {
  it("calls onVatModeChange when switching to Non-VAT", () => {
    const onVatModeChange = vi.fn();
    render(
      <VatModeCalcToggle
        vatMode={VatApplicability.VAT}
        onVatModeChange={onVatModeChange}
        vatCalc={VatMode.VatNok}
        onVatCalcChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Non-VAT" }));
    expect(onVatModeChange).toHaveBeenCalledWith(VatApplicability.NON_VAT);
  });

  it("calls onVatCalcChange when switching inclusive/exclusive", () => {
    const onVatCalcChange = vi.fn();
    render(
      <VatModeCalcToggle
        vatMode={VatApplicability.VAT}
        onVatModeChange={() => {}}
        vatCalc={VatMode.VatNok}
        onVatCalcChange={onVatCalcChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Incl." }));
    expect(onVatCalcChange).toHaveBeenCalledWith(VatMode.VatNai);
  });

  it("disables the calc radios when VAT mode is Non-VAT", () => {
    render(
      <VatModeCalcToggle
        vatMode={VatApplicability.NON_VAT}
        onVatModeChange={() => {}}
        vatCalc={VatMode.VatNok}
        onVatCalcChange={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: "Incl." })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Excl." })).toBeDisabled();
  });

  it("re-selects live as the user interacts", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "VAT" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Non-VAT" }));
    expect(screen.getByRole("radio", { name: "Non-VAT" })).toBeChecked();
  });
});
