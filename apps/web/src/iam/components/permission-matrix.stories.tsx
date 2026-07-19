import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import type { Permission } from "@erp/contracts";
import { PermissionMatrix, type PermissionMatrixLabels } from "./permission-matrix";

/** Wires the component's `labels` prop to the real `iam` namespace so the Storybook toolbar's
 * locale control actually retranslates the matrix — the same wiring role-detail.tsx/roles-list.tsx
 * use in the app (M1 §5.1). */
function useMatrixLabels(): PermissionMatrixLabels {
  const { t } = useTranslation("iam");
  return {
    affectsUsers: (count) => t("matrix.affectsUsers", { count }),
    specialGroupCaption: t("matrix.specialGroupCaption"),
    lastPermissionBlocked: t("matrix.lastPermissionBlocked"),
    collapseGroup: (module) => t("matrix.collapseGroup", { module }),
    expandGroup: (module) => t("matrix.expandGroup", { module }),
  };
}

function PermissionMatrixDemo({
  initialGranted = [],
  ...rest
}: {
  initialGranted?: Permission[];
  isSystemRole?: boolean;
  initialValue?: Permission[];
  affectedUserCount?: number;
}) {
  const [value, setValue] = React.useState<Permission[]>(initialGranted);
  const labels = useMatrixLabels();
  return <PermissionMatrix value={value} onChange={setValue} labels={labels} {...rest} />;
}

const meta = {
  title: "IAM/PermissionMatrix",
  component: PermissionMatrix,
  args: { value: [], onChange: () => {} },
  parameters: { layout: "padded" },
} satisfies Meta<typeof PermissionMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The full `PERMISSIONS` catalog (the component's default), collapsible per module. Arrow keys
 * move the active checkbox within a group's grid (roving tabindex, M1 §5.2 WCAG AA); Tab leaves
 * the grid after one stop. */
export const Default: Story = {
  render: () => <PermissionMatrixDemo />,
};

/** A role mid-edit: the selection differs from `initialValue`, so the live "affects N users"
 * caption (MD2) is showing. */
export const DirtyWithAffectedUsers: Story = {
  render: () => (
    <PermissionMatrixDemo
      initialGranted={["iam.user.manage", "iam.role.manage"]}
      initialValue={["iam.user.manage"]}
      affectedUserCount={12}
    />
  ),
};

/** A system role: unchecking its last permission is blocked inline instead of silently allowed. */
export const SystemRoleBlocksLastPermission: Story = {
  render: () => <PermissionMatrixDemo initialGranted={["iam.user.manage"]} isSystemRole />,
};
