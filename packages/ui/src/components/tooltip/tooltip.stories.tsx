import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tooltip, TooltipProvider } from "./tooltip";
import { Button } from "../button/button";

const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  args: { content: "Requires sales.document.void", children: <span /> },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  parameters: { layout: "padded" },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnDisabledAction: Story = {
  render: () => (
    <Tooltip content="Requires sales.document.void">
      <Button variant="secondary">Void</Button>
    </Tooltip>
  ),
};
