import type { Meta, StoryObj } from "@storybook/react-vite";
import { InvoiceStatus, QuotationStatus } from "@erp/contracts";
import { DocLifecycleChip } from "./doc-lifecycle-chip";

const meta = {
  title: "Sales/DocLifecycleChip",
  component: DocLifecycleChip,
  args: { status: QuotationStatus.DRAFT },
  parameters: { layout: "padded" },
} satisfies Meta<typeof DocLifecycleChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QuotationStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {Object.values(QuotationStatus).map((s) => (
        <DocLifecycleChip key={s} status={s} />
      ))}
    </div>
  ),
};

export const InvoiceStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {Object.values(InvoiceStatus).map((s) => (
        <DocLifecycleChip key={s} status={s} />
      ))}
    </div>
  ),
};
