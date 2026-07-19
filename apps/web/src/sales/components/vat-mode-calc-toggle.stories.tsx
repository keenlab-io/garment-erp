import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { VatApplicability, VatMode } from "@erp/contracts";
import { VatModeCalcToggle } from "./vat-mode-calc-toggle";

/** Wires the toggle's `labels` to the real `sales` namespace so the Storybook toolbar's locale
 * control retranslates it (M5 §5.3, mirrors `subcontract-sla-chip.stories.tsx`'s wiring). */
function Harness({ initialVatMode = VatApplicability.VAT }: { initialVatMode?: VatApplicability }) {
  const { t } = useTranslation("sales");
  const [vatMode, setVatMode] = React.useState<VatApplicability>(initialVatMode);
  const [vatCalc, setVatCalc] = React.useState<VatMode>(VatMode.VatNok);
  return (
    <VatModeCalcToggle
      vatMode={vatMode}
      onVatModeChange={setVatMode}
      vatCalc={vatCalc}
      onVatCalcChange={setVatCalc}
      labels={{
        vatModeLabel: t("vatToggle.vatModeLabel"),
        vatOptionVat: t("vatToggle.vatOptionVat"),
        vatOptionNonVat: t("vatToggle.vatOptionNonVat"),
        calcLabel: t("vatToggle.calcLabel"),
        calcOptionInclusive: t("vatToggle.calcOptionInclusive"),
        calcOptionExclusive: t("vatToggle.calcOptionExclusive"),
      }}
    />
  );
}

const meta = {
  title: "Sales/VatModeCalcToggle",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Harness />,
};

export const NonVatDisablesCalc: Story = {
  render: () => <Harness initialVatMode={VatApplicability.NON_VAT} />,
};
