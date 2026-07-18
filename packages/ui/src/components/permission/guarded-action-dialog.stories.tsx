import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button/button";
import { PermissionsProvider } from "./permissions-context";
import { GuardedActionDialog, type GuardedActionKind } from "./guarded-action-dialog";

const meta = {
  title: "Permission/GuardedActionDialog",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ kind, subject }: { kind: GuardedActionKind; subject: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <PermissionsProvider permissions={[]} isSuperAdmin>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Trigger
      </Button>
      <GuardedActionDialog
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        subject={subject}
        onConfirm={() => setOpen(false)}
      />
    </PermissionsProvider>
  );
}

export const DocumentVoid: Story = {
  render: () => <Demo kind="document-void" subject="QV20260042" />,
};

export const ForceLogout: Story = {
  render: () => <Demo kind="force-logout" subject="jane@example.com" />,
};

export const RoleDelete: Story = {
  render: () => <Demo kind="role-delete" subject="Warehouse Clerk" />,
};

export const StockAdjustment: Story = {
  render: () => <Demo kind="stock-adjustment" subject="ADJ-0007" />,
};

export const PayrollApprove: Story = {
  render: () => <Demo kind="payroll-approve" subject="2026-07" />,
};
