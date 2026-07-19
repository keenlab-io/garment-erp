import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionsProvider } from "@erp/ui";
import { BomTreeEditor, type BomTreeNode } from "./bom-tree-editor";

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

function ExpandableDemo() {
  const [expandedIds, setExpandedIds] = React.useState<string[]>([]);
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
  render: () => (
    <PermissionsProvider permissions={[]} isSuperAdmin={false}>
      <BomTreeEditor
        root={ROOT}
        conversionCost="5.0000"
        rolledUpCost="141.5700"
        expandedIds={["zipper-assembly"]}
        onToggleExpand={() => {}}
        className="max-w-2xl"
      />
    </PermissionsProvider>
  ),
};
