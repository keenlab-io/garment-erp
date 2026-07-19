import * as React from "react";
import { useTranslation } from "react-i18next";
import type { SubcontractStatus } from "@erp/contracts";
import {
  PermissionButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  useToast,
} from "@erp/ui";
import { useReceiveSubcontractMutation, useSubcontractsQuery } from "../../../production/queries.js";
import { SubcontractSlaChip } from "../../../production/components/subcontract-sla-chip.js";

const STATUS_FILTERS: Array<SubcontractStatus | "ALL"> = ["ALL", "SENT", "OVERDUE", "RECEIVED"];

const STATUS_LABEL_KEY = {
  SENT: "subcontracts.filterSent",
  OVERDUE: "subcontracts.filterOverdue",
  RECEIVED: "subcontracts.filterReceived",
} as const satisfies Record<SubcontractStatus, string>;

/**
 * The subcontract SLA tracker (M4 §4.4, design MD4): every sent/overdue/received subcontract with
 * its work order/step context (`listSubcontracts` joins those in, since the bare `Subcontract` DTO
 * only carries `wo_step_id`) and a live SLA countdown chip; receiving returns the step to the line.
 */
export function SubcontractsPage() {
  const { t } = useTranslation("production");
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = React.useState<SubcontractStatus | "ALL">("ALL");
  const receive = useReceiveSubcontractMutation();

  const subcontracts = useSubcontractsQuery({
    limit: 100,
    ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
  });
  const rows = subcontracts.data?.body.data ?? [];

  async function handleReceive(id: string) {
    await receive.mutateAsync({ params: { id }, body: undefined });
    toast({ tone: "success", title: t("subcontracts.received") });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("subcontracts.title")}</h1>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SubcontractStatus | "ALL")}>
          <SelectTrigger aria-label={t("subcontracts.filterLabel")} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                {status === "ALL" ? t("subcontracts.filterAll") : t(STATUS_LABEL_KEY[status])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {subcontracts.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : subcontracts.isError ? (
        <p className="text-sm text-danger">{t("subcontracts.loadError")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t("subcontracts.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-bg-sunken">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t("subcontracts.columnWoNo")}
                </th>
                <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t("subcontracts.columnStep")}
                </th>
                <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t("subcontracts.columnVendor")}
                </th>
                <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t("subcontracts.columnSla")}
                </th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-mono text-text-link">{row.wo_no}</td>
                  <td className="px-3 py-2 text-text-primary">{row.step_name}</td>
                  <td className="px-3 py-2 text-text-primary">{row.vendor}</td>
                  <td className="px-3 py-2">
                    <SubcontractSlaChip
                      slaDue={row.sla_due}
                      status={row.status}
                      labels={{
                        due: (duration) => t("subcontractSlaChip.due", { duration }),
                        overdue: (duration) => t("subcontractSlaChip.overdue", { duration }),
                        received: t("subcontractSlaChip.received"),
                        noDueDate: t("subcontractSlaChip.noDueDate"),
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.status !== "RECEIVED" && (
                      <PermissionButton
                        required="production.subcontract.manage"
                        variant="secondary"
                        onClick={() => void handleReceive(row.id)}
                        loading={receive.isPending}
                      >
                        {t("subcontracts.receiveAction")}
                      </PermissionButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
