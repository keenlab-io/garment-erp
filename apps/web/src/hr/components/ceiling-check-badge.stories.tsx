import type { Meta, StoryObj } from "@storybook/react-vite";
import { CeilingCheckBadge } from "./ceiling-check-badge";

const meta = {
  title: "HR/CeilingCheckBadge",
  component: CeilingCheckBadge,
  args: { ceiling: "10000.00" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof CeilingCheckBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Within: Story = {
  args: { amount: "3000.00" },
};

export const Approaching: Story = {
  args: { amount: "7500.00" },
};

export const Over: Story = {
  args: { amount: "12000.00" },
};

export const AllStates: Story = {
  args: { amount: "0" },
  render: () => (
    <div className="flex flex-col gap-2">
      <CeilingCheckBadge amount="3000.00" ceiling="10000.00" />
      <CeilingCheckBadge amount="7500.00" ceiling="10000.00" />
      <CeilingCheckBadge amount="12000.00" ceiling="10000.00" />
    </div>
  ),
};
