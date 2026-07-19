import * as React from "react";
import { useTranslation } from "react-i18next";
import type { OtRequest } from "@erp/contracts";
import {
  Button,
  DataTable,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  InkChip,
  statusColumn,
  textColumn,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useApproveOtRequestMutation, useEmployeesQuery, useOtRequestsQuery } from "../../../hr/queries.js";
import { otRequestStatusToChip } from "../../../hr/chip-status.js";

interface OtRow {
  id: string;
  employeeName: string;
  workDate: string;
  window: string;
  rateType: string;
  status: OtRequest["status"];
}

/**
 * The OT approval queue (M2 §4.3, design "OT approval queue"): submitted requests, an approve
 * row action, and a detail drawer. The contract has no reject endpoint for OT requests (only
 * `approve`/`reconcile`) — rejection is out of this screen's scope.
 */
export function OtApprovalsPage() {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const { density } = useDensity();

  const otQueue = useOtRequestsQuery({ "filter[status]": "SUBMITTED" });
  const employees = useEmployeesQuery({ limit: 100 });
  const approve = useApproveOtRequestMutation();
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const employeeNameById = React.useMemo(
    () => new Map((employees.data?.body.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`])),
    [employees.data],
  );

  const requests = otQueue.data?.body.ot_requests ?? [];
  const rows = React.useMemo<OtRow[]>(
    () =>
      requests.map((r) => ({
        id: r.id,
        employeeName: employeeNameById.get(r.employee_id) ?? r.employee_id,
        workDate: r.work_date,
        window: `${r.start_time}–${r.end_time}`,
        rateType: r.rate_type,
        status: r.status,
      })),
    [requests, employeeNameById],
  );

  const detail = requests.find((r) => r.id === detailId);

  function handleApprove(id: string) {
    approve.mutate(
      { params: { id }, body: undefined },
      { onSuccess: () => toast({ tone: "success", title: t("approvals.otApproved") }) },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("approvals.otTitle")}</h1>

      <DataTable
        data={rows}
        columns={[
          textColumn<OtRow>("employeeName", { header: t("approvals.columnEmployee") }),
          textColumn<OtRow>("workDate", { header: t("approvals.columnWorkDate") }),
          textColumn<OtRow>("window", { header: t("approvals.columnWindow"), secondary: true }),
          textColumn<OtRow>("rateType", { header: t("approvals.columnRateType"), secondary: true }),
          statusColumn<OtRow, OtRequest["status"]>("status", {
            header: t("approvals.columnStatus"),
            resolve: otRequestStatusToChip,
          }),
        ]}
        getRowId={(row) => row.id}
        density={density}
        isLoading={otQueue.isLoading}
        error={otQueue.isError ? { message: t("approvals.loadError") } : null}
        onRetry={() => otQueue.refetch()}
        emptyState={{ title: t("approvals.otEmpty") }}
        rowActions={(row) => [
          { key: "view", label: t("approvals.viewAction"), onClick: () => setDetailId(row.id) },
          {
            key: "approve",
            label: t("approvals.approveAction"),
            onClick: () => handleApprove(row.id),
          },
        ]}
      />

      <Drawer open={detail !== null} onOpenChange={(open) => !open && setDetailId(null)}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader>
            <DrawerTitle className="text-h3 font-semibold text-text-primary">
              {detail ? employeeNameById.get(detail.employee_id) ?? detail.employee_id : ""}
            </DrawerTitle>
          </DrawerHeader>
          {detail && (
            <DrawerBody className="flex flex-col gap-3">
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-muted">{t("approvals.columnWorkDate")}</dt>
                  <dd className="text-text-primary">{detail.work_date}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">{t("approvals.columnWindow")}</dt>
                  <dd className="text-text-primary">
                    {detail.start_time}–{detail.end_time}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">{t("approvals.columnRateType")}</dt>
                  <dd className="text-text-primary">{detail.rate_type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">{t("approvals.otReason")}</dt>
                  <dd className="text-text-primary">{detail.reason ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">{t("approvals.columnStatus")}</dt>
                  <dd>
                    <InkChip status={otRequestStatusToChip(detail.status)} />
                  </dd>
                </div>
              </dl>
              <Button
                onClick={() => handleApprove(detail.id)}
                disabled={detail.status !== "SUBMITTED"}
                loading={approve.isPending}
              >
                {t("approvals.approveAction")}
              </Button>
            </DrawerBody>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
