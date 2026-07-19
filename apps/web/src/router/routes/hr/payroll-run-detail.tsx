import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatMoney, sumMoney, toDecimal } from "@erp/utils";
import { Button, Skeleton, useToast, type ConfirmResult } from "@erp/ui";
import { usePeriodFormat } from "../../../i18n/use-formatters.js";
import { HR_PAYROLL_PATH } from "../../../nav/hr-paths.js";
import {
  useApprovePayrollRunMutation,
  useCalculatePayrollRunMutation,
  useEmployeesQuery,
  useOtRequestsQuery,
  usePayrollRunsQuery,
  usePayslipsQuery,
} from "../../../hr/queries.js";
import {
  PayrollWizard,
  type PayrollScopeEmployee,
  type PayrollWizardStep,
  type PayslipPreviewRow,
} from "../../../hr/components/payroll-wizard.js";
import { PayslipBreakdownDrawer, type PayslipLine } from "../../../hr/components/payslip-breakdown-drawer.js";

const STEP_FOR_STATUS: Record<string, PayrollWizardStep> = {
  DRAFT: "inputs",
  CALCULATED: "review",
  APPROVED: "approve",
  PAID: "approve",
  CLOSED: "approve",
};

/**
 * The payroll run workspace (M2 §4.2, design MD1/MD2): the run wizard over `PayrollWizard`, the
 * payslip breakdown drawer, and the guarded approve. The `hr` contract has no `GET` for a single
 * run — its status/period come from the run list query, matched by id (M2 §2.1 note).
 * `PayslipSummary.breakdown` carries every term of the net-pay formula (gated by
 * `hr.salary.view`, same as `gross`/`net`); a viewer without that permission never receives it,
 * so the preview/breakdown rows fall back to "0"/net-only rather than fabricate figures.
 * `unreconciledOt` is derived from the OT queue (APPROVED-but-not-RECONCILED requests).
 */
export function PayrollRunDetailPage() {
  const { id } = useParams({ from: "/hr/payroll/runs/$id" });
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const formatPeriod = usePeriodFormat();

  const runs = usePayrollRunsQuery();
  const run = runs.data?.body.payroll_runs.find((r) => r.id === id);

  const [step, setStep] = React.useState<PayrollWizardStep | null>(null);
  const [excludedIds, setExcludedIds] = React.useState<string[]>([]);
  const [calculating, setCalculating] = React.useState(false);
  const [breakdownPayslipId, setBreakdownPayslipId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (run && step === null) setStep(STEP_FOR_STATUS[run.status] ?? "inputs");
  }, [run, step]);

  // Scope: active/probation employees (mirrors the backend's computeRun eligibility). Limited to
  // the first page — the wizard has no server-side scope-selection query yet.
  const employees = useEmployeesQuery({ limit: 100 });
  const otQueue = useOtRequestsQuery({ "filter[status]": "APPROVED" });
  const payslips = usePayslipsQuery(id, { poll: calculating });

  const calculate = useCalculatePayrollRunMutation();
  const approve = useApprovePayrollRunMutation();

  const unreconciledEmployeeIds = React.useMemo(
    () => new Set((otQueue.data?.body.ot_requests ?? []).map((r) => r.employee_id)),
    [otQueue.data],
  );

  const scope = React.useMemo<PayrollScopeEmployee[]>(
    () =>
      (employees.data?.body.data ?? [])
        .filter((e) => e.status === "ACTIVE" || e.status === "PROBATION")
        .map((e) => ({
          id: e.id,
          name: `${e.first_name} ${e.last_name}`,
          missingSalary: !e.base_salary,
          unreconciledOt: unreconciledEmployeeIds.has(e.id),
        })),
    [employees.data, unreconciledEmployeeIds],
  );

  const employeeNameById = React.useMemo(
    () => new Map((employees.data?.body.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`])),
    [employees.data],
  );

  const payslipRows = React.useMemo<PayslipPreviewRow[]>(
    () =>
      (payslips.data?.body.payslips ?? []).map((p) => ({
        id: p.id,
        employeeId: p.employee_id,
        employeeName: employeeNameById.get(p.employee_id) ?? p.employee_id,
        base: p.breakdown?.base ?? "0",
        ot: p.breakdown?.ot ?? "0",
        allowances: p.breakdown ? sumMoney(p.breakdown.allowances.map((a) => a.amount)) : "0",
        deductions: p.breakdown ? sumMoney(p.breakdown.deductions.map((d) => d.amount)) : "0",
        sso: p.breakdown?.sso ?? "0",
        tax: p.breakdown?.tax ?? "0",
        advance: p.breakdown?.advance ?? "0",
        net: p.net ?? "0",
      })),
    [payslips.data, employeeNameById],
  );

  // Deduction terms come back as positive magnitudes; negate for `MoneyCell`'s accounting parens.
  const negated = (amount: string) => formatMoney(toDecimal(amount).negated());

  const breakdownPayslip = payslips.data?.body.payslips.find((p) => p.id === breakdownPayslipId);
  const breakdownEmployeeName = breakdownPayslip
    ? (employeeNameById.get(breakdownPayslip.employee_id) ?? breakdownPayslip.employee_id)
    : "";
  const breakdownLines: PayslipLine[] = !breakdownPayslip
    ? []
    : breakdownPayslip.breakdown
      ? [
          { key: "base", label: t("payroll.breakdownBase"), amount: breakdownPayslip.breakdown.base, kind: "earning" },
          { key: "ot", label: t("payroll.breakdownOt"), amount: breakdownPayslip.breakdown.ot, kind: "earning" },
          ...breakdownPayslip.breakdown.allowances.map((a, i) => ({
            key: `allowance-${i}`,
            label: a.name,
            amount: a.amount,
            kind: "earning" as const,
          })),
          { key: "sso", label: t("payroll.breakdownSso"), amount: negated(breakdownPayslip.breakdown.sso), kind: "deduction" as const },
          { key: "tax", label: t("payroll.breakdownTax"), amount: negated(breakdownPayslip.breakdown.tax), kind: "deduction" as const },
          {
            key: "advance",
            label: t("payroll.breakdownAdvance"),
            amount: negated(breakdownPayslip.breakdown.advance),
            kind: "deduction" as const,
          },
          ...breakdownPayslip.breakdown.deductions.map((d, i) => ({
            key: `deduction-${i}`,
            label: d.name,
            amount: negated(d.amount),
            kind: "deduction" as const,
          })),
          { key: "net", label: t("payroll.breakdownNet"), amount: breakdownPayslip.net ?? "0", kind: "net" as const },
        ]
      : [{ key: "net", label: t("payroll.breakdownNet"), amount: breakdownPayslip.net ?? "0", kind: "net" as const }];

  if (runs.isLoading || step === null) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <p className="text-sm text-danger">{t("payroll.loadError")}</p>
        <Button variant="secondary" onClick={() => runs.refetch()}>
          {t("payroll.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link to={HR_PAYROLL_PATH} className="text-sm text-text-link">
        ← {t("payroll.back")}
      </Link>

      <PayrollWizard
        period={run.period}
        formatPeriod={formatPeriod}
        status={run.status}
        step={step}
        onStepChange={setStep}
        scope={scope}
        excludedEmployeeIds={excludedIds}
        onToggleExclude={(employeeId) =>
          setExcludedIds((ids) => (ids.includes(employeeId) ? ids.filter((i) => i !== employeeId) : [...ids, employeeId]))
        }
        onCalculate={async () => {
          setCalculating(true);
          try {
            await calculate.mutateAsync({ params: { id }, body: undefined });
          } finally {
            setCalculating(false);
          }
        }}
        calculating={calculating || calculate.isPending}
        payslips={payslipRows}
        onOpenBreakdown={setBreakdownPayslipId}
        onApprove={async (_result: ConfirmResult) => {
          await approve.mutateAsync({ params: { id }, body: undefined });
          toast({ tone: "success", title: t("payroll.runApproved") });
        }}
        approving={approve.isPending}
        labels={{
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
        }}
      />

      <PayslipBreakdownDrawer
        open={breakdownPayslipId !== null}
        onOpenChange={(open) => {
          if (!open) setBreakdownPayslipId(null);
        }}
        employeeName={breakdownEmployeeName}
        period={run.period}
        formatPeriod={formatPeriod}
        lines={breakdownLines}
        labels={{
          title: (employeeName) => t("payroll.payslipTitle", { employeeName }),
          period: t("payroll.periodLabel"),
        }}
      />
    </div>
  );
}
