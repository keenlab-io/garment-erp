import * as React from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@erp/ui";
import {
  useApproveCashAdvanceMutation,
  useCashAdvancesQuery,
  useEmployeesQuery,
  useRejectCashAdvanceMutation,
} from "../../../hr/queries.js";
import { CashAdvanceApprovalCard } from "../../../hr/components/cash-advance-approval-card.js";

/**
 * The mobile cash-advance approval queue (M2 §4.3, design MD3): a single thumb-reachable card per
 * pending advance, no table. Approve is Super-Admin re-auth-gated inside `CashAdvanceApprovalCard`
 * itself; reject captures a reason via the card's own `ConfirmDialog` (not persisted — the
 * `cash_advance` table has no reason column for it, only the status transition + actor are saved).
 */
export function CashAdvanceApprovalsPage() {
  const { t } = useTranslation("hr");
  const { toast } = useToast();

  const advances = useCashAdvancesQuery({ "filter[status]": "SUBMITTED" });
  const employees = useEmployeesQuery({ limit: 100 });
  const approve = useApproveCashAdvanceMutation();
  const reject = useRejectCashAdvanceMutation();
  const [approvingId, setApprovingId] = React.useState<string | null>(null);
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);

  const employeeNameById = React.useMemo(
    () => new Map((employees.data?.body.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`])),
    [employees.data],
  );

  const requests = advances.data?.body.cash_advances ?? [];

  async function handleApprove(id: string) {
    setApprovingId(id);
    try {
      await approve.mutateAsync({ params: { id }, body: undefined });
      toast({ tone: "success", title: t("approvals.advanceApproved") });
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(id: string, reason: string) {
    setRejectingId(id);
    try {
      await reject.mutateAsync({ params: { id }, body: { reason } });
      toast({ tone: "success", title: t("approvals.advanceRejected") });
    } finally {
      setRejectingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("approvals.advancesTitle")}</h1>

      {advances.isLoading && <p className="text-sm text-text-muted">{t("approvals.loading")}</p>}
      {advances.isError && <p className="text-sm text-danger">{t("approvals.loadError")}</p>}
      {!advances.isLoading && requests.length === 0 && (
        <p className="text-sm text-text-muted">{t("approvals.advancesEmpty")}</p>
      )}

      {requests.map((advance) => (
        <CashAdvanceApprovalCard
          key={advance.id}
          employeeName={employeeNameById.get(advance.employee_id) ?? advance.employee_id}
          amount={advance.amount}
          ceiling={advance.ceiling}
          reason={advance.reason}
          status={advance.status}
          onApprove={() => handleApprove(advance.id)}
          onReject={(reason) => handleReject(advance.id, reason)}
          approving={approvingId === advance.id}
          rejecting={rejectingId === advance.id}
          labels={{
            amountLabel: t("approvals.cardAmountLabel"),
            reasonLabel: t("approvals.cardReasonLabel"),
            noReason: t("approvals.cardNoReason"),
            approve: t("approvals.cardApprove"),
            reject: t("approvals.cardReject"),
            approveTitle: (employeeName) => t("approvals.cardApproveTitle", { employeeName }),
            approveConsequence: (employeeName) => t("approvals.cardApproveConsequence", { employeeName }),
            rejectTitle: (employeeName) => t("approvals.cardRejectTitle", { employeeName }),
            rejectConsequence: (employeeName) => t("approvals.cardRejectConsequence", { employeeName }),
            superAdminOnly: t("approvals.cardSuperAdminOnly"),
          }}
          ceilingLabels={{
            within: t("approvals.ceilingWithin"),
            approaching: t("approvals.ceilingApproaching"),
            over: t("approvals.ceilingOver"),
          }}
        />
      ))}
    </div>
  );
}
