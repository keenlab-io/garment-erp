import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionsProvider } from "./permissions-context";
import { MaskedValue } from "./masked-value";

const meta = {
  title: "Permission/MaskedValue",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Revealed: Story = {
  render: () => (
    <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
      <MaskedValue permission="inventory.cost.view" value="฿1,234.56" />
    </PermissionsProvider>
  ),
};

export const Masked: Story = {
  render: () => (
    <PermissionsProvider permissions={[]} isSuperAdmin={false}>
      <MaskedValue permission="inventory.cost.view" value="฿1,234.56" />
    </PermissionsProvider>
  ),
};

export const CostMaskedStockVisible: Story = {
  render: () => (
    <PermissionsProvider permissions={[]} isSuperAdmin={false}>
      <div className="flex items-center gap-6">
        <div>
          <div className="text-caption text-text-secondary">On-hand qty</div>
          <div className="font-numeric tabular-nums">120 pcs</div>
        </div>
        <div>
          <div className="text-caption text-text-secondary">Average cost</div>
          <MaskedValue permission="inventory.cost.view" value="฿48.20" />
        </div>
      </div>
    </PermissionsProvider>
  ),
};
