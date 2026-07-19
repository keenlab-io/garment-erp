import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgingBucketChip } from "./aging-bucket-chip";

const meta = {
  title: "Sales/AgingBucketChip",
  component: AgingBucketChip,
  args: { daysOverdue: 0 },
  parameters: { layout: "padded" },
} satisfies Meta<typeof AgingBucketChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllBuckets: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <AgingBucketChip daysOverdue={-5} />
      <AgingBucketChip daysOverdue={15} />
      <AgingBucketChip daysOverdue={45} />
      <AgingBucketChip daysOverdue={75} />
      <AgingBucketChip daysOverdue={120} />
    </div>
  ),
};
