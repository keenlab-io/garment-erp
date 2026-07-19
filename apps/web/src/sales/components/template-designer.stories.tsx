import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import {
  TemplateDesigner,
  emptyNamedRangeMapping,
  type NamedRangeMapping,
  type TemplateAssetSlot,
} from "./template-designer";

/** Wires the designer's `labels` to the real `sales` namespace so the Storybook toolbar's locale
 * control retranslates it (M5 §5.3, mirrors `subcontract-sla-chip.stories.tsx`'s wiring; matches
 * `templates.tsx`'s screen-level wiring of the same keys). */
function Harness() {
  const { t } = useTranslation("sales");
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
      labels={{
        assetsTitle: t("templates.assetsTitle"),
        slot: { logo: t("templates.slotLogo"), signature: t("templates.slotSignature"), stamp: t("templates.slotStamp") },
        uploadLabel: t("templates.uploadLabel"),
        removeAsset: t("templates.removeAsset"),
        noAsset: t("templates.noAsset"),
        mappingsTitle: t("templates.mappingsTitle"),
        rangeNameLabel: t("templates.rangeNameLabel"),
        fieldLabel: t("templates.fieldLabel"),
        addMapping: t("templates.addMapping"),
        removeMapping: t("templates.removeMapping"),
      }}
    />
  );
}

const meta = {
  title: "Sales/TemplateDesigner",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Harness />,
};
