import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { PermissionsProvider } from "@erp/ui";
import { BomTreeEditor, type BomTreeEditorLabels, type BomTreeNode } from "./bom-tree-editor";

const ROOT: BomTreeNode = {
  id: "finished",
  itemLabel: "Denim jacket",
  qty: "1",
  scrapPct: "0",
  unitCost: "0.0000",
  extendedCost: "0.0000",
  children: [
    {
      id: "fabric",
      itemLabel: "Denim fabric 14oz",
      qty: "1.5",
      scrapPct: "0.05",
      unitCost: "80.0000",
      extendedCost: "126.0000",
    },
    {
      id: "zipper-assembly",
      itemLabel: "Zipper assembly",
      qty: "1",
      scrapPct: "0",
      unitCost: "12.0000",
      extendedCost: "12.0000",
      hasChildren: true,
      children: [
        { id: "zipper", itemLabel: "YKK zipper 20cm", qty: "1", scrapPct: "0.02", unitCost: "3.5000", extendedCost: "3.5700" },
        { id: "pull-tab", itemLabel: "Pull tab", qty: "1", scrapPct: "0", unitCost: "0.3000", extendedCost: "0.3000" },
      ],
    },
  ],
};

/** Wires the tree editor's `labels` to the real `inventory` namespace so the Storybook toolbar's
 * locale control retranslates it (M3 §5.3, mirrors `item-detail.tsx`'s wiring). */
function useTreeLabels(): BomTreeEditorLabels {
  const { t } = useTranslation("inventory");
  return {
    itemColumn: t("bom.itemColumn"),
    qtyColumn: t("bom.qtyColumn"),
    scrapColumn: t("bom.scrapColumn"),
    unitCostColumn: t("bom.unitCostColumn"),
    extendedCostColumn: t("bom.extendedCostColumn"),
    rolledUpCostLabel: t("bom.rolledUpCostLabel"),
    conversionCostLabel: t("bom.conversionCostLabel"),
    expand: t("bom.expand"),
    collapse: t("bom.collapse"),
  };
}

function ExpandableDemo() {
  const [expandedIds, setExpandedIds] = React.useState<string[]>([]);
  const labels = useTreeLabels();
  return (
    <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
      <BomTreeEditor
        root={ROOT}
        conversionCost="5.0000"
        rolledUpCost="141.5700"
        expandedIds={expandedIds}
        onToggleExpand={(id) =>
          setExpandedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]))
        }
        labels={labels}
        className="max-w-2xl"
      />
    </PermissionsProvider>
  );
}

const meta = {
  title: "Inventory/BomTreeEditor",
  component: BomTreeEditor,
  args: { root: ROOT, expandedIds: [], onToggleExpand: () => {} },
  parameters: { layout: "padded" },
} satisfies Meta<typeof BomTreeEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExpandCollapse: Story = {
  render: () => <ExpandableDemo />,
};

export const CostMasked: Story = {
  render: () => {
    const labels = useTreeLabels();
    return (
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <BomTreeEditor
          root={ROOT}
          conversionCost="5.0000"
          rolledUpCost="141.5700"
          expandedIds={["zipper-assembly"]}
          onToggleExpand={() => {}}
          labels={labels}
          className="max-w-2xl"
        />
      </PermissionsProvider>
    );
  },
};
