import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { AllocMethod } from "@erp/contracts";
import { PermissionsProvider } from "@erp/ui";
import { LandedCostAllocator, type LandedCostAllocatorLabels, type LandedCostLine } from "./landed-cost-allocator";

const LINES: LandedCostLine[] = [
  { id: "l1", itemLabel: "Cotton twill 32/1", qty: "100", unitPrice: "50.0000", unitWeight: "2" },
  { id: "l2", itemLabel: "Poly lining", qty: "50", unitPrice: "20.0000", unitWeight: "1" },
  { id: "l3", itemLabel: "YKK zipper 20cm", qty: "300", unitPrice: "3.5000", unitWeight: "0.02" },
];

/** Wires the allocator's `labels` to the real `inventory` namespace so the Storybook toolbar's
 * locale control retranslates it (M3 §5.3, mirrors `goods-receipt-wizard.tsx`'s wiring). */
function useAllocatorLabels(): LandedCostAllocatorLabels {
  const { t } = useTranslation("inventory");
  return {
    methodLabel: t("landedCost.methodLabel"),
    methodValue: t("landedCost.methodValue"),
    methodWeight: t("landedCost.methodWeight"),
    methodQty: t("landedCost.methodQty"),
    freightLabel: t("landedCost.freightLabel"),
    itemColumn: t("landedCost.itemColumn"),
    qtyColumn: t("landedCost.qtyColumn"),
    allocatedColumn: t("landedCost.allocatedColumn"),
    unitCostColumn: t("landedCost.unitCostColumn"),
    totalLabel: t("landedCost.totalLabel"),
  };
}

function LiveAllocatorDemo() {
  const [method, setMethod] = React.useState<AllocMethod>(AllocMethod.VALUE);
  const [freightTotal, setFreightTotal] = React.useState("450");
  const labels = useAllocatorLabels();
  return (
    <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
      <LandedCostAllocator
        lines={LINES}
        method={method}
        onMethodChange={setMethod}
        freightTotal={freightTotal}
        onFreightTotalChange={setFreightTotal}
        labels={labels}
        className="max-w-2xl"
      />
    </PermissionsProvider>
  );
}

const meta = {
  title: "Inventory/LandedCostAllocator",
  component: LandedCostAllocator,
  args: {
    lines: LINES,
    method: AllocMethod.VALUE,
    onMethodChange: () => {},
    freightTotal: "450",
    onFreightTotalChange: () => {},
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof LandedCostAllocator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  render: () => <LiveAllocatorDemo />,
};

export const CostMasked: Story = {
  render: () => {
    const labels = useAllocatorLabels();
    return (
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <LandedCostAllocator
          lines={LINES}
          method={AllocMethod.VALUE}
          onMethodChange={() => {}}
          freightTotal="450"
          onFreightTotalChange={() => {}}
          labels={labels}
          className="max-w-2xl"
        />
      </PermissionsProvider>
    );
  },
};
