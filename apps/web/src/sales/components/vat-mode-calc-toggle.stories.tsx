import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { VatApplicability, VatMode } from "@erp/contracts";
import { VatModeCalcToggle } from "./vat-mode-calc-toggle";

const meta = {
  title: "Sales/VatModeCalcToggle",
  component: VatModeCalcToggle,
  args: {
    vatMode: VatApplicability.VAT,
    onVatModeChange: () => {},
    vatCalc: VatMode.VatNok,
    onVatCalcChange: () => {},
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof VatModeCalcToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

function Harness() {
  const [vatMode, setVatMode] = React.useState<VatApplicability>(VatApplicability.VAT);
  const [vatCalc, setVatCalc] = React.useState<VatMode>(VatMode.VatNok);
  return (
    <VatModeCalcToggle vatMode={vatMode} onVatModeChange={setVatMode} vatCalc={vatCalc} onVatCalcChange={setVatCalc} />
  );
}

export const Default: Story = {
  render: () => <Harness />,
};

export const NonVatDisablesCalc: Story = {
  args: {
    vatMode: VatApplicability.NON_VAT,
    onVatModeChange: () => {},
    vatCalc: VatMode.VatNok,
    onVatCalcChange: () => {},
  },
};
