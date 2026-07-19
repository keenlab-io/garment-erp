import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionsProvider } from "@erp/ui";
import { CashAdvanceApprovalCard } from "./cash-advance-approval-card";

const meta = {
  title: "HR/CashAdvanceApprovalCard",
  component: CashAdvanceApprovalCard,
  args: {
    employeeName: "Somchai Jaidee",
    amount: "4500.00",
    ceiling: "10000.00",
    reason: "Motorbike repair",
    status: "SUBMITTED",
    onApprove: () => {},
    onReject: () => {},
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof CashAdvanceApprovalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuperAdminView: Story = {
  render: (args) => (
    <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin>
      <CashAdvanceApprovalCard {...args} />
    </PermissionsProvider>
  ),
};

export const RegularApproverView: Story = {
  render: (args) => (
    <PermissionsProvider permissions={[]} isSuperAdmin={false}>
      <CashAdvanceApprovalCard {...args} />
    </PermissionsProvider>
  ),
};

export const NearCeiling: Story = {
  args: { amount: "9200.00" },
  render: (args) => (
    <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin>
      <CashAdvanceApprovalCard {...args} />
    </PermissionsProvider>
  ),
};

export const AlreadyApproved: Story = {
  args: { status: "APPROVED" },
  render: (args) => (
    <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin>
      <CashAdvanceApprovalCard {...args} />
    </PermissionsProvider>
  ),
};
