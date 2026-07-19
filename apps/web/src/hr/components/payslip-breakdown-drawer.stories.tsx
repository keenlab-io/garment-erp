import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { PermissionsProvider } from "@erp/ui";
import { usePeriodFormat } from "../../i18n/use-formatters";
import { PayslipBreakdownDrawer, type PayslipBreakdownDrawerLabels, type PayslipLine } from "./payslip-breakdown-drawer";

const LINES: PayslipLine[] = [
  { key: "base", label: "Base salary", amount: "18000.00", kind: "earning" },
  { key: "ot", label: "Overtime", amount: "1250.00", kind: "earning" },
  { key: "allowances", label: "Allowances", amount: "500.00", kind: "earning" },
  { key: "sso", label: "Social security", amount: "-750.00", kind: "deduction" },
  { key: "tax", label: "Withholding tax", amount: "-320.00", kind: "deduction" },
  { key: "advance", label: "Cash-advance repayment", amount: "-1000.00", kind: "deduction" },
  { key: "net", label: "Net pay", amount: "17680.00", kind: "net" },
];

/** Wires the component's `labels` prop to the real `hr` namespace so the Storybook toolbar's
 * locale control retranslates the drawer (M2 §5.3, same wiring role as `payroll-run-detail.tsx`). */
function useDrawerLabels(): PayslipBreakdownDrawerLabels {
  const { t } = useTranslation("hr");
  return {
    title: (employeeName) => t("payroll.payslipTitle", { employeeName }),
    period: t("payroll.periodLabel"),
  };
}

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
  render: (args) => {
    const labels = useDrawerLabels();
    const formatPeriod = usePeriodFormat();
    return (
      <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin={false}>
        <PayslipBreakdownDrawer {...args} labels={labels} formatPeriod={formatPeriod} />
      </PermissionsProvider>
    );
  },
};

export const Masked: Story = {
  render: (args) => {
    const labels = useDrawerLabels();
    const formatPeriod = usePeriodFormat();
    return (
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <PayslipBreakdownDrawer {...args} labels={labels} formatPeriod={formatPeriod} />
      </PermissionsProvider>
    );
  },
};
