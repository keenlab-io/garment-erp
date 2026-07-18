import type { Meta, StoryObj } from "@storybook/react-vite";
import { TooltipProvider } from "../tooltip/tooltip";
import { PermissionsProvider } from "./permissions-context";
import { PermissionButton } from "./permission-button";

const meta = {
  title: "Permission/PermissionButton",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Granted: Story = {
  render: () => (
    <TooltipProvider delayDuration={0}>
      <PermissionsProvider permissions={["sales.document.void"]} isSuperAdmin={false}>
        <PermissionButton required="sales.document.void" variant="destructive">
          Void
        </PermissionButton>
      </PermissionsProvider>
    </TooltipProvider>
  ),
};

export const DeniedWithTooltip: Story = {
  render: () => (
    <TooltipProvider delayDuration={0}>
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <PermissionButton required="sales.document.void" variant="destructive">
          Void
        </PermissionButton>
      </PermissionsProvider>
    </TooltipProvider>
  ),
};
