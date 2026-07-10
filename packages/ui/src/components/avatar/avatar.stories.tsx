import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "./avatar";

const meta = {
  title: "Primitives/Avatar",
  component: Avatar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar size="sm" name="Somchai P." initials="SP" />
      <Avatar size="md" name="Nong K." initials="NK" />
      <Avatar size="lg" name="Aran T." initials="AT" />
    </div>
  ),
};
