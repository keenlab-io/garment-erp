import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Neutral</Badge>
      <Badge tone="accent">Active</Badge>
      <Badge tone="success">Paid</Badge>
      <Badge tone="warning">Near min</Badge>
      <Badge tone="danger">Overdue</Badge>
      <Badge tone="info">Issued</Badge>
      <Badge tone="accent" mono>
        Calculated
      </Badge>
    </div>
  ),
};
