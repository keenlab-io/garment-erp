import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { PermissionsProvider } from "@erp/ui";
import { usePeriodFormat } from "../../i18n/use-formatters";
import { PayrollWizard, type PayrollWizardLabels, type PayrollWizardStep, type PayslipPreviewRow } from "./payroll-wizard";

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

/** Wires the wizard's `labels` to the real `hr` namespace so the Storybook toolbar's locale
 * control retranslates it (M2 §5.3, mirrors `payroll-run-detail.tsx`'s wiring). */
function useWizardLabels(): PayrollWizardLabels {
  const { t } = useTranslation("hr");
  return {
    stepLabel: {
      inputs: t("payroll.stepInputs"),
      calculate: t("payroll.stepCalculate"),
      review: t("payroll.stepReview"),
      approve: t("payroll.stepApprove"),
    },
    stepsAriaLabel: t("payroll.stepsAriaLabel"),
    scopeColumn: t("payroll.scopeColumn"),
    flagsColumn: t("payroll.flagsColumn"),
    excludeColumn: t("payroll.excludeColumn"),
    missingSalary: t("payroll.missingSalary"),
    unreconciledOt: t("payroll.unreconciledOt"),
    noBlockingFlags: t("payroll.noBlockingFlags"),
    blockingNotice: t("payroll.blockingNotice"),
    continueToCalculate: t("payroll.continueToCalculate"),
    runCalculation: t("payroll.runCalculation"),
    calculating: t("payroll.calculating"),
    continueToReview: t("payroll.continueToReview"),
    continueToApprove: t("payroll.continueToApprove"),
    employeeColumn: t("payroll.employeeColumn"),
    netColumn: t("payroll.netColumn"),
    outlier: t("payroll.outlier"),
    viewBreakdown: t("payroll.viewBreakdown"),
    approveCount: (count) => t("payroll.approveCount", { count }),
    netTotalLabel: t("payroll.netTotalLabel"),
    approve: t("payroll.approveRun"),
  };
}

function Demo(props: { initialStep?: PayrollWizardStep; payslips?: PayslipPreviewRow[] }) {
  const [step, setStep] = React.useState<PayrollWizardStep>(props.initialStep ?? "inputs");
  const [excluded, setExcluded] = React.useState<string[]>([]);
  const labels = useWizardLabels();
  const formatPeriod = usePeriodFormat();
  return (
    <PermissionsProvider permissions={["hr.salary.view", "hr.payroll.approve"]} isSuperAdmin={false}>
      <PayrollWizard
        period="2026-07"
        formatPeriod={formatPeriod}
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
        labels={labels}
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
