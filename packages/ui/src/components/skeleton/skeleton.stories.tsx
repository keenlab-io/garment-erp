import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./skeleton";

const meta = {
  title: "Primitives/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton variant="line" className="w-1/2" />
        <Skeleton variant="line" />
        <Skeleton variant="line" className="w-3/4" />
      </div>
      <Skeleton variant="block" />
      <div className="flex flex-col gap-1 border border-border p-2">
        <Skeleton variant="table-row" />
        <Skeleton variant="table-row" />
        <Skeleton variant="table-row" />
      </div>
    </div>
  ),
};
