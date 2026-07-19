import type { Meta, StoryObj } from "@storybook/react-vite";
import { StockHealthChip } from "./stock-health-chip";

const meta = {
  title: "Inventory/StockHealthChip",
  component: StockHealthChip,
  args: { onHand: "500", minStock: "100" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof StockHealthChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <StockHealthChip onHand="500" minStock="100" />
      <StockHealthChip onHand="80" minStock="100" />
      <StockHealthChip onHand="0" minStock="100" dead />
    </div>
  ),
};
