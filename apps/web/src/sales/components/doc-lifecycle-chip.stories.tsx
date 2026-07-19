import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { InvoiceStatus, QuotationStatus } from "@erp/contracts";
import { DocLifecycleChip, type DocLifecycleStatus } from "./doc-lifecycle-chip";
import { DOC_LIFECYCLE_LABEL_KEY } from "../doc-lifecycle-labels";

/** Wires each chip's `label` to the real `sales` namespace so the Storybook toolbar's locale
 * control retranslates it (M5 §5.3, mirrors `subcontract-sla-chip.stories.tsx`'s wiring) — the
 * status is never color-alone: glyph + swatch + this translated label all carry the meaning. */
function StatusRow({ statuses }: { statuses: readonly DocLifecycleStatus[] }) {
  const { t } = useTranslation("sales");
  return (
    <div className="flex flex-wrap items-center gap-4">
      {statuses.map((status) => (
        <DocLifecycleChip key={status} status={status} label={t(DOC_LIFECYCLE_LABEL_KEY[status])} />
      ))}
    </div>
  );
}

const meta = {
  title: "Sales/DocLifecycleChip",
  parameters: { layout: "padded" },
} satisfies Meta<typeof StatusRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QuotationStatuses: Story = {
  render: () => <StatusRow statuses={Object.values(QuotationStatus)} />,
};

export const InvoiceStatuses: Story = {
  render: () => <StatusRow statuses={Object.values(InvoiceStatus)} />,
};
