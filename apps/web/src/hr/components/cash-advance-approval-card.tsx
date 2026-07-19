import * as React from "react";
import type { CashAdvanceStatus } from "@erp/contracts";
import {
  Button,
  ConfirmDialog,
  MaskedValue,
  MoneyCell,
  Tooltip,
  cn,
  usePermissions,
  type ConfirmResult,
} from "@erp/ui";
import { CeilingCheckBadge } from "./ceiling-check-badge.js";

export interface CashAdvanceApprovalCardLabels {
  amountLabel: string;
  reasonLabel: string;
  noReason: string;
  approve: string;
  reject: string;
  approveTitle: (employeeName: string) => string;
  approveConsequence: (employeeName: string) => string;
  rejectTitle: (employeeName: string) => string;
  rejectConsequence: (employeeName: string) => string;
  superAdminOnly: string;
}

const defaultLabels: CashAdvanceApprovalCardLabels = {
  amountLabel: "Amount",
  reasonLabel: "Reason",
  noReason: "No reason given",
  approve: "Approve",
  reject: "Reject",
  approveTitle: (employeeName) => `Approve cash advance for ${employeeName}?`,
  approveConsequence: (employeeName) =>
    `This disburses the cash advance to ${employeeName} once processed.`,
  rejectTitle: (employeeName) => `Reject cash advance for ${employeeName}?`,
  rejectConsequence: (employeeName) => `This rejects ${employeeName}'s cash-advance request.`,
  superAdminOnly: "Requires Super-Admin",
};

export interface CashAdvanceApprovalCardProps {
  employeeName: string;
  /** The requested amount, a decimal money string — masked without `hr.salary.view`. */
  amount: string;
  /** The configured cash-advance ceiling, a decimal money string. */
  ceiling: string;
  reason?: string | null;
  status: CashAdvanceStatus;
  /** Called with the re-auth password once a Super-Admin confirms approval. */
  onApprove: (password: string) => void | Promise<void>;
  /** Called with the captured reason once reject is confirmed. */
  onReject: (reason: string) => void | Promise<void>;
  approving?: boolean;
  rejecting?: boolean;
  labels?: Partial<CashAdvanceApprovalCardLabels>;
  className?: string;
}

/**
 * Mobile-first cash-advance approval card (M2 §3.3, design MD3) — a single thumb-reachable card
 * (employee · amount · reason · ceiling-check badge), completable one-handed. Approve is
 * Super-Admin-only and requires re-auth (password); Reject captures a reason. No table on mobile.
 */
export function CashAdvanceApprovalCard({
  employeeName,
  amount,
  ceiling,
  reason,
  status,
  onApprove,
  onReject,
  approving = false,
  rejecting = false,
  labels: labelsProp,
  className,
}: CashAdvanceApprovalCardProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const { isSuperAdmin } = usePermissions();
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const pending = status === "SUBMITTED";

  async function handleApprove(result: ConfirmResult) {
    await onApprove(result.password ?? "");
    setApproveOpen(false);
  }

  async function handleReject(result: ConfirmResult) {
    await onReject(result.reason ?? "");
    setRejectOpen(false);
  }

  const approveButton = (
    <Button
      variant="primary"
      onClick={() => setApproveOpen(true)}
      disabled={!pending || !isSuperAdmin}
      className="w-full"
    >
      {labels.approve}
    </Button>
  );

  return (
    <div
      className={cn(
        "flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-body-strong text-text-primary">{employeeName}</span>
        <CeilingCheckBadge amount={amount} ceiling={ceiling} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption uppercase tracking-wide text-text-muted">
          {labels.amountLabel}
        </span>
        <MaskedValue
          permission="hr.salary.view"
          value={<MoneyCell value={amount} className="text-h3 text-right" />}
          className="text-h3 font-semibold"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption uppercase tracking-wide text-text-muted">
          {labels.reasonLabel}
        </span>
        <p className="text-sm text-text-secondary">{reason || labels.noReason}</p>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {isSuperAdmin ? (
          approveButton
        ) : (
          <Tooltip content={labels.superAdminOnly}>
            <span className="w-full">{approveButton}</span>
          </Tooltip>
        )}
        <Button
          variant="secondary"
          onClick={() => setRejectOpen(true)}
          disabled={!pending}
          className="w-full"
        >
          {labels.reject}
        </Button>
      </div>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={labels.approveTitle(employeeName)}
        consequence={labels.approveConsequence(employeeName)}
        onConfirm={handleApprove}
        confirmLabel={labels.approve}
        requirePassword
        loading={approving}
      />
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={labels.rejectTitle(employeeName)}
        consequence={labels.rejectConsequence(employeeName)}
        onConfirm={handleReject}
        confirmLabel={labels.reject}
        destructive
        requireReason
        loading={rejecting}
      />
    </div>
  );
}
