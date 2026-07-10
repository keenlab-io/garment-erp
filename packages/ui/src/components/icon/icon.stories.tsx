import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search, Package, Factory, Receipt, Users } from "lucide-react";
import { Icon } from "./icon";

const meta = {
  title: "Primitives/Icon",
  component: Icon,
  args: { icon: Search },
  parameters: { layout: "padded" },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DensitySized: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-text-primary">
      <Icon icon={Search} label="Search" />
      <Icon icon={Package} />
      <Icon icon={Factory} />
      <Icon icon={Receipt} />
      <Icon icon={Users} />
      <span className="text-caption text-text-muted">flip density in the toolbar to resize</span>
    </div>
  ),
};

export const ExplicitSize: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-text-primary">
      <Icon icon={Package} size={16} />
      <Icon icon={Package} size={24} />
      <Icon icon={Package} size={40} />
    </div>
  ),
};
