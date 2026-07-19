import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionsProvider } from "@erp/ui";
import { PayslipBreakdownDrawer, type PayslipLine } from "./payslip-breakdown-drawer";

const LINES: PayslipLine[] = [
  { key: "base", label: "Base salary", amount: "18000.00", kind: "earning" },
  { key: "ot", label: "Overtime", amount: "1250.00", kind: "earning" },
  { key: "allowances", label: "Allowances", amount: "500.00", kind: "earning" },
  { key: "sso", label: "Social security", amount: "-750.00", kind: "deduction" },
  { key: "tax", label: "Withholding tax", amount: "-320.00", kind: "deduction" },
  { key: "advance", label: "Cash-advance repayment", amount: "-1000.00", kind: "deduction" },
  { key: "net", label: "Net pay", amount: "17680.00", kind: "net" },
];

const meta = {
  title: "HR/PayslipBreakdownDrawer",
  component: PayslipBreakdownDrawer,
  args: {
    open: true,
    onOpenChange: () => {},
    employeeName: "Somchai Jaidee",
    period: "2026-07",
    lines: LINES,
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PayslipBreakdownDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Authorized: Story = {
  render: (args) => (
    <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin={false}>
      <PayslipBreakdownDrawer {...args} />
    </PermissionsProvider>
  ),
};

export const Masked: Story = {
  render: (args) => (
    <PermissionsProvider permissions={[]} isSuperAdmin={false}>
      <PayslipBreakdownDrawer {...args} />
    </PermissionsProvider>
  ),
};
