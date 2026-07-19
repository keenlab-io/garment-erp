import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button, Skeleton, useToast, type ConfirmResult } from "@erp/ui";
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
 * run — its status/period come from the run list query, matched by id (M2 §2.1 note). Likewise
 * `PayslipSummary` only exposes `gross`/`net` (not the full breakdown) — the preview/breakdown
 * rows below fill the unavailable terms with "0" rather than fabricate figures; only net/gross
 * are real. `unreconciledOt` is derived from the OT queue (APPROVED-but-not-RECONCILED requests).
 */
export function PayrollRunDetailPage() {
  const { id } = useParams({ from: "/hr/payroll/runs/$id" });
  const { t } = useTranslation("hr");
  const { toast } = useToast();

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
        base: "0",
        ot: "0",
        allowances: "0",
        deductions: "0",
        sso: "0",
        tax: "0",
        advance: "0",
        net: p.net ?? "0",
      })),
    [payslips.data, employeeNameById],
  );

  const breakdownPayslip = payslipRows.find((p) => p.id === breakdownPayslipId);
  const breakdownLines: PayslipLine[] = breakdownPayslip
    ? [
        { key: "net", label: t("payroll.breakdownNet"), amount: breakdownPayslip.net, kind: "net" },
      ]
    : [];

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
        }}
      />

      <PayslipBreakdownDrawer
        open={breakdownPayslipId !== null}
        onOpenChange={(open) => {
          if (!open) setBreakdownPayslipId(null);
        }}
        employeeName={breakdownPayslip?.employeeName ?? ""}
        period={run.period}
        lines={breakdownLines}
      />
    </div>
  );
}
