import type { Meta, StoryObj } from "@storybook/react-vite";
import { DefectTilePicker } from "./defect-tile-picker";

const meta = {
  title: "Production/DefectTilePicker",
  component: DefectTilePicker,
  args: { onSubmit: () => {} },
  parameters: { layout: "padded" },
} satisfies Meta<typeof DefectTilePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
