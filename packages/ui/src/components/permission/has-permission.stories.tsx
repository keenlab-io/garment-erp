import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionsProvider } from "./permissions-context";
import { HasPermission } from "./has-permission";

const meta = {
  title: "Permission/HasPermission",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Granted: Story = {
  render: () => (
    <PermissionsProvider permissions={["sales.document.void"]} isSuperAdmin={false}>
      <HasPermission required="sales.document.void" fallback={<span>— absent —</span>}>
        <span>Void action renders</span>
      </HasPermission>
    </PermissionsProvider>
  ),
};

export const Denied: Story = {
  render: () => (
    <PermissionsProvider permissions={[]} isSuperAdmin={false}>
      <HasPermission required="sales.document.void" fallback={<span>— absent —</span>}>
        <span>Void action renders</span>
      </HasPermission>
    </PermissionsProvider>
  ),
};

export const SuperAdminBypass: Story = {
  render: () => (
    <PermissionsProvider permissions={[]} isSuperAdmin>
      <HasPermission required="sales.document.void" fallback={<span>— absent —</span>}>
        <span>Void action renders</span>
      </HasPermission>
    </PermissionsProvider>
  ),
};
