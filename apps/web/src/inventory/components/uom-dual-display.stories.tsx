import type { Meta, StoryObj } from "@storybook/react-vite";
import { UomDualDisplay } from "./uom-dual-display";

const meta = {
  title: "Inventory/UomDualDisplay",
  component: UomDualDisplay,
  args: { qty: "1", uomLabel: "roll", baseQty: "50", baseUomLabel: "m" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof UomDualDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RollToMeters: Story = {};

export const BoxToPieces: Story = {
  args: { qty: "1", uomLabel: "box", baseQty: "144", baseUomLabel: "pcs" },
};
