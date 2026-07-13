import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./button";
import { Icon } from "../icon/icon";

const meta = {
  title: "Primitives/Button",
  component: Button,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Create invoice</Button>
      <Button variant="secondary">Clone</Button>
      <Button variant="ghost">Back</Button>
      <Button variant="destructive">Void document</Button>
      <Button variant="icon" aria-label="Add line">
        <Icon icon={Plus} />
      </Button>
    </div>
  ),
};

export const WithLeadingIcon: Story = {
  render: () => (
    <Button variant="primary">
      <Icon icon={Plus} />
      New
    </Button>
  ),
};

export const States: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>Default</Button>
      <Button disabled>Disabled</Button>
      <Button loading>Saving</Button>
      <Button variant="destructive" loading>
        Voiding
      </Button>
      <Button variant="icon" aria-label="Delete" loading>
        <Icon icon={Trash2} />
      </Button>
    </div>
  ),
};

export const AsLink: Story = {
  render: () => (
    <Button asChild variant="secondary">
      <a href="#preview">Open preview</a>
    </Button>
  ),
};
