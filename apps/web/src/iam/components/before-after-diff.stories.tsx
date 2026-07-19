import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { BeforeAfterDiff, type BeforeAfterDiffLabels } from "./before-after-diff";

/** Wires the component's `labels` prop to the real `iam` namespace's `diff` group (the same wiring
 * `audit-table.tsx`'s `diffLabels` forwards from `audit-log.tsx`/`user-detail.tsx`, M1 §5.1). */
function useDiffLabels(): BeforeAfterDiffLabels {
  const { t } = useTranslation("iam");
  return {
    beforeHeading: t("diff.beforeHeading"),
    afterHeading: t("diff.afterHeading"),
    emptyValue: t("diff.emptyValue"),
    noChanges: t("diff.noChanges"),
  };
}

const meta = {
  title: "IAM/BeforeAfterDiff",
  component: BeforeAfterDiff,
  args: { before: null, after: null },
  parameters: { layout: "padded" },
} satisfies Meta<typeof BeforeAfterDiff>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A role's permission-change audit entry: changed fields highlight, unchanged fields don't. */
export const RoleUpdate: Story = {
  render: function Demo() {
    const labels = useDiffLabels();
    return (
      <BeforeAfterDiff
        before={{ name: "Warehouse Clerk", permission_codes: ["inventory.receipt.manage"] }}
        after={{ name: "Warehouse Clerk", permission_codes: ["inventory.receipt.manage", "inventory.issue.manage"] }}
        labels={labels}
      />
    );
  },
};

/** A create action: every field is "new" against an empty `before` snapshot. */
export const Created: Story = {
  render: function Demo() {
    const labels = useDiffLabels();
    return <BeforeAfterDiff before={null} after={{ name: "New Role", is_system: false }} labels={labels} />;
  },
};

/** No field-level changes recorded (e.g. a login/logout entry) — the empty-state copy. */
export const NoChanges: Story = {
  render: function Demo() {
    const labels = useDiffLabels();
    return <BeforeAfterDiff before={null} after={null} labels={labels} />;
  },
};
