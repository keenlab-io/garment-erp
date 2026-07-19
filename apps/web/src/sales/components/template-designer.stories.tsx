import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TemplateDesigner, emptyNamedRangeMapping, type NamedRangeMapping, type TemplateAssetSlot } from "./template-designer";

const meta = {
  title: "Sales/TemplateDesigner",
  component: TemplateDesigner,
  args: {
    assets: { logo: null, signature: null, stamp: null },
    onAssetChange: () => {},
    mappings: [],
    onMappingsChange: () => {},
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof TemplateDesigner>;

export default meta;
type Story = StoryObj<typeof meta>;

function Harness() {
  const [assets, setAssets] = React.useState<Record<TemplateAssetSlot, string | null>>({
    logo: null,
    signature: null,
    stamp: null,
  });
  const [mappings, setMappings] = React.useState<NamedRangeMapping[]>([
    { id: "m1", rangeName: "grand_total", field: "grandTotal" },
    emptyNamedRangeMapping(),
  ]);
  return (
    <TemplateDesigner
      assets={assets}
      onAssetChange={(slot, url) => setAssets((prev) => ({ ...prev, [slot]: url }))}
      mappings={mappings}
      onMappingsChange={setMappings}
    />
  );
}

export const Default: Story = {
  render: () => <Harness />,
};
