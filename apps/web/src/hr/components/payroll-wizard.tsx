import * as React from "react";
import { Check } from "lucide-react";
import { toDecimal } from "@erp/utils";
import type { PayrollRunStatus } from "@erp/contracts";
import {
  Badge,
  Button,
  Checkbox,
  GuardedActionDialog,
  Icon,
  InkChip,
  MaskedValue,
  MoneyCell,
  PermissionButton,
  Skeleton,
  cn,
  type ConfirmResult,
} from "@erp/ui";
import { payrollRunStatusToChip } from "../chip-status.js";

export type PayrollWizardStep = "inputs" | "calculate" | "review" | "approve";

const STEPS: PayrollWizardStep[] = ["inputs", "calculate", "review", "approve"];

export interface PayrollScopeEmployee {
  id: string;
  name: string;
  /** No current salary record — must be excluded or resolved before calculating. */
  missingSalary?: boolean;
  /** Has OT hours not yet reconciled against attendance — same gate as `missingSalary`. */
  unreconciledOt?: boolean;
}

/**
 * One employee's calculated payslip preview row (design MD1: base/OT/allowances/deductions/
 * SSO/tax/advance/NET). `deductions`/`sso`/`tax`/`advance` are negative money strings so
 * `MoneyCell` renders them in accounting parentheses. The `hr` contract's `PayslipSummary`
 * only exposes `gross`/`net` today (see `payslip-breakdown-drawer.tsx`) — the run screen
 * (M2 §4.2) maps to this richer shape once the breakdown is wired through the contract.
 */
export interface PayslipPreviewRow {
  id: string;
  employeeId: string;
  employeeName: string;
  base: string;
  ot: string;
  allowances: string;
  deductions: string;
  sso: string;
  tax: string;
  advance: string;
  net: string;
}

/** A payslip is an outlier when net pay is non-positive or more than double the base salary. */
function isOutlier(row: PayslipPreviewRow): boolean {
  const net = toDecimal(row.net);
  return net.lessThanOrEqualTo(0) || net.greaterThan(toDecimal(row.base).times(2));
}

export interface PayrollWizardLabels {
  stepLabel: Record<PayrollWizardStep, string>;
  scopeColumn: string;
  flagsColumn: string;
  excludeColumn: string;
  missingSalary: string;
  unreconciledOt: string;
  noBlockingFlags: string;
  blockingNotice: string;
  continueToCalculate: string;
  runCalculation: string;
  calculating: string;
  continueToReview: string;
  continueToApprove: string;
  employeeColumn: string;
  netColumn: string;
  outlier: string;
  viewBreakdown: string;
  approveCount: (count: number) => string;
  netTotalLabel: string;
  approve: string;
}

const defaultLabels: PayrollWizardLabels = {
  stepLabel: { inputs: "Inputs", calculate: "Calculate", review: "Review", approve: "Approve" },
  scopeColumn: "Employee",
  flagsColumn: "Flags",
  excludeColumn: "Exclude",
  missingSalary: "Missing salary",
  unreconciledOt: "Unreconciled OT",
  noBlockingFlags: "No missing data — ready to calculate.",
  blockingNotice: "Resolve or exclude the flagged employees before calculating.",
  continueToCalculate: "Continue to calculate",
  runCalculation: "Run calculation",
  calculating: "Calculating…",
  continueToReview: "Continue to review",
  continueToApprove: "Continue to approve",
  employeeColumn: "Employee",
  netColumn: "Net",
  outlier: "Outlier",
  viewBreakdown: "View breakdown",
  approveCount: (count) => `${count} payslip${count === 1 ? "" : "s"}`,
  netTotalLabel: "Net total",
  approve: "Approve payroll",
};

export interface PayrollWizardProps {
  /** Payroll period, "YYYY-MM". */
  period: string;
  status: PayrollRunStatus;
  step: PayrollWizardStep;
  onStepChange: (step: PayrollWizardStep) => void;
  scope: PayrollScopeEmployee[];
  excludedEmployeeIds: string[];
  onToggleExclude: (employeeId: string) => void;
  onCalculate: () => void | Promise<void>;
  calculating?: boolean;
  payslips: PayslipPreviewRow[];
  onOpenBreakdown: (payslipId: string) => void;
  onApprove: (result: ConfirmResult) => void | Promise<void>;
  approving?: boolean;
  labels?: Partial<PayrollWizardLabels>;
  className?: string;
}

/**
 * The payroll run wizard (M2 §3.1, design MD1) — Inputs → Calculate → Review → Approve, gated by
 * a missing-data check and a guarded final approve. `@erp/ui` has no shared Wizard/Stepper
 * primitive yet (that's `m3-inventory-frontend` §3.3, sequenced after this change) — the step
 * header below is a bespoke, local implementation pending that primitive; migrate this component
 * onto it once M3 lands rather than treating this as the long-term shape.
 */
export function PayrollWizard({
  period,
  status,
  step,
  onStepChange,
  scope,
  excludedEmployeeIds,
  onToggleExclude,
  onCalculate,
  calculating = false,
  payslips,
  onOpenBreakdown,
  onApprove,
  approving = false,
  labels: labelsProp,
  className,
}: PayrollWizardProps) {
  const labels = React.useMemo(
    () => ({ ...defaultLabels, ...labelsProp, stepLabel: { ...defaultLabels.stepLabel, ...labelsProp?.stepLabel } }),
    [labelsProp],
  );
  const [approveOpen, setApproveOpen] = React.useState(false);

  const excluded = React.useMemo(() => new Set(excludedEmployeeIds), [excludedEmployeeIds]);
  const blocking = scope.filter((e) => !excluded.has(e.id) && (e.missingSalary || e.unreconciledOt));
  const canCalculate = blocking.length === 0;
  const canReview = payslips.length > 0;
  const netTotal = payslips.reduce((sum, row) => sum.plus(toDecimal(row.net)), toDecimal(0)).toFixed(2);

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold text-text-primary">{period}</h2>
        <InkChip status={payrollRunStatusToChip(status)} />
      </div>

      <ol className="flex items-center gap-2" aria-label="Payroll run steps">
        {STEPS.map((s, index) => {
          const isCurrent = index === stepIndex;
          const isDone = index < stepIndex;
          const reachable = index <= stepIndex;
          return (
            <li key={s} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => reachable && onStepChange(s)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium",
                  isCurrent && "bg-accent-subtle text-accent-text",
                  !isCurrent && reachable && "text-text-primary hover:bg-bg-sunken",
                  !reachable && "text-text-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-caption",
                    isDone && "border-success bg-success-subtle text-success-on",
                    isCurrent && "border-accent bg-accent text-text-inverse",
                    !isDone && !isCurrent && "border-border text-text-muted",
                  )}
                >
                  {isDone ? <Icon icon={Check} size={12} /> : index + 1}
                </span>
                {labels.stepLabel[s]}
              </button>
              {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {step === "inputs" && (
        <div className="flex flex-col gap-3">
          {blocking.length > 0 ? (
            <p className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-on">
              {labels.blockingNotice}
            </p>
          ) : (
            <p className="rounded-md border border-success bg-success-subtle px-3 py-2 text-sm text-success-on">
              {labels.noBlockingFlags}
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-bg-sunken">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {labels.scopeColumn}
                  </th>
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {labels.flagsColumn}
                  </th>
                  <th scope="col" className="px-3 py-2 text-center text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {labels.excludeColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {scope.map((employee) => (
                  <tr key={employee.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-text-primary">{employee.name}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {employee.missingSalary && <Badge tone="danger">{labels.missingSalary}</Badge>}
                        {employee.unreconciledOt && <Badge tone="warning">{labels.unreconciledOt}</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Checkbox
                        aria-label={`${labels.excludeColumn} ${employee.name}`}
                        checked={excluded.has(employee.id)}
                        onCheckedChange={() => onToggleExclude(employee.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button onClick={() => onStepChange("calculate")} disabled={!canCalculate} className="self-start">
            {labels.continueToCalculate}
          </Button>
        </div>
      )}

      {step === "calculate" && (
        <div className="flex flex-col gap-3">
          {calculating ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <span className="text-sm text-text-secondary">{labels.calculating}</span>
              <Skeleton variant="table-row" columns={4} />
              <Skeleton variant="table-row" columns={4} />
            </div>
          ) : (
            <Button onClick={() => onCalculate()} disabled={!canCalculate} className="self-start">
              {labels.runCalculation}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => onStepChange("review")}
            disabled={!canReview}
            className="self-start"
          >
            {labels.continueToReview}
          </Button>
        </div>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-bg-sunken">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {labels.employeeColumn}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {labels.netColumn}
                  </th>
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    &nbsp;
                  </th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-text-primary">
                      <div className="flex items-center gap-2">
                        {row.employeeName}
                        {isOutlier(row) && <InkChip status="overdue" label={labels.outlier} />}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MaskedValue permission="hr.salary.view" value={<MoneyCell value={row.net} />} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="secondary" onClick={() => onOpenBreakdown(row.id)}>
                        {labels.viewBreakdown}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button onClick={() => onStepChange("approve")} className="self-start">
            {labels.continueToApprove}
          </Button>
        </div>
      )}

      {step === "approve" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {labels.approveCount(payslips.length)} · {labels.netTotalLabel}{" "}
            <MaskedValue permission="hr.salary.view" value={<MoneyCell value={netTotal} />} />
          </p>
          <PermissionButton
            required="hr.payroll.approve"
            onClick={() => setApproveOpen(true)}
            className="self-start"
          >
            {labels.approve}
          </PermissionButton>
          <GuardedActionDialog
            open={approveOpen}
            onOpenChange={setApproveOpen}
            kind="payroll-approve"
            subject={period}
            loading={approving}
            onConfirm={async (result) => {
              await onApprove(result);
              setApproveOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
