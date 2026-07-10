import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoneyCell, QtyCell } from "./numeric-cell";

const meta = {
  title: "Primitives/NumericCell",
  component: MoneyCell,
  args: { value: "0" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof MoneyCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Money: Story = {
  render: () => (
    <div className="grid w-64 grid-cols-1 gap-1 border border-border p-3">
      <MoneyCell value="53500.00" />
      <MoneyCell value="1240.5" />
      <MoneyCell value="-2000.00" />
      <MoneyCell value="0" />
      <MoneyCell value="16520.0000" currency="" />
    </div>
  ),
};

export const Quantity: Story = {
  render: () => (
    <div className="grid w-64 grid-cols-1 gap-1 border border-border p-3">
      <QtyCell value="4250" unit="ml" />
      <QtyCell value="12.5" unit="pcs" />
      <QtyCell value="-3" unit="pcs" />
      <QtyCell value="4250" />
    </div>
  ),
};
