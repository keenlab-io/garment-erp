import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionsProvider } from "@erp/ui";
import { PayrollWizard, type PayrollWizardStep, type PayslipPreviewRow } from "./payroll-wizard";

const SCOPE = [
  { id: "e1", name: "Somchai Jaidee" },
  { id: "e2", name: "Suda Boonmee", missingSalary: true },
  { id: "e3", name: "Anan Srisuk", unreconciledOt: true },
];

const PAYSLIPS: PayslipPreviewRow[] = [
  {
    id: "p1",
    employeeId: "e1",
    employeeName: "Somchai Jaidee",
    base: "18000.00",
    ot: "1250.00",
    allowances: "500.00",
    deductions: "-200.00",
    sso: "-750.00",
    tax: "-320.00",
    advance: "-1000.00",
    net: "17480.00",
  },
  {
    id: "p2",
    employeeId: "e3",
    employeeName: "Anan Srisuk",
    base: "15000.00",
    ot: "0.00",
    allowances: "0.00",
    deductions: "0.00",
    sso: "0.00",
    tax: "0.00",
    advance: "0.00",
    net: "-500.00",
  },
];

function Demo(props: { initialStep?: PayrollWizardStep; payslips?: PayslipPreviewRow[] }) {
  const [step, setStep] = React.useState<PayrollWizardStep>(props.initialStep ?? "inputs");
  const [excluded, setExcluded] = React.useState<string[]>([]);
  return (
    <PermissionsProvider permissions={["hr.salary.view", "hr.payroll.approve"]} isSuperAdmin={false}>
      <PayrollWizard
        period="2026-07"
        status="DRAFT"
        step={step}
        onStepChange={setStep}
        scope={SCOPE}
        excludedEmployeeIds={excluded}
        onToggleExclude={(id) =>
          setExcluded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
        }
        onCalculate={() => {}}
        payslips={props.payslips ?? []}
        onOpenBreakdown={() => {}}
        onApprove={() => {}}
      />
    </PermissionsProvider>
  );
}

const meta = {
  title: "HR/PayrollWizard",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InputsWithBlockingFlags: Story = {
  render: () => <Demo initialStep="inputs" />,
};

export const ReviewWithOutlier: Story = {
  render: () => <Demo initialStep="review" payslips={PAYSLIPS} />,
};

export const Approve: Story = {
  render: () => <Demo initialStep="approve" payslips={PAYSLIPS} />,
};
