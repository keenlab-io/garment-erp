import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./select";

const meta = {
  title: "Primitives/Select",
  component: Select,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: () => (
    <div className="max-w-xs">
      <Select defaultValue="qv">
        <SelectTrigger aria-label="Document type">
          <SelectValue placeholder="Select type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="qv">QV — valued</SelectItem>
          <SelectItem value="qnv">QNV — non-valued</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};
