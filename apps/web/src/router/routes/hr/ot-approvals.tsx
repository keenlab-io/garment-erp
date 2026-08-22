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
  PermissionButton,
  statusColumn,
  textColumn,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import {
  useApproveOtRequestMutation,
  useEmployeesQuery,
  useOtRequestsQuery,
  useReconcileOtRequestMutation,
} from "../../../hr/queries.js";
import { otRequestStatusToChip } from "../../../hr/chip-status.js";
import { CreateOtRequestDrawer } from "./ot-request-create-drawer.js";

interface OtRow {
  id: string;
  employeeName: string;
  workDate: string;
  window: string;
  rateType: string;
  approvedHours: string;
  status: OtRequest["status"];
}

/**
 * The OT approval queue (M2 §4.3, design "OT approval queue"): the requests awaiting action, the
 * approve and reconcile row actions, and a detail drawer. The contract has no reject endpoint for
 * OT requests (only `approve`/`reconcile`) — rejection is out of this screen's scope.
 *
 * Reconcile settles `approved_hours` against attendance (the server takes
 * `min(requested, attended)`, and attended is 0 when no attendance row exists), moving
 * APPROVED → RECONCILED. Payroll treats an unreconciled request as a blocking flag, so without
 * this action a run can never include the employee.
 *
 * The queue is deliberately NOT filtered by status: a request has to stay on screen after it is
 * approved, or there would be nowhere to reconcile it from.
 */
export function OtApprovalsPage() {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const { density } = useDensity();

  const otQueue = useOtRequestsQuery();
  const employees = useEmployeesQuery({ limit: 100 });
  const approve = useApproveOtRequestMutation();
  const reconcile = useReconcileOtRequestMutation();
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

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
        approvedHours: r.approved_hours ?? "—",
        status: r.status,
      })),
    [requests, employeeNameById],
  );

  const detail = requests.find((r) => r.id === detailId);

  function handleApprove(id: string) {
    approve.mutate(
      { params: { id } },
      { onSuccess: () => toast({ tone: "success", title: t("approvals.otApproved") }) },
    );
  }

  function handleReconcile(id: string) {
    // No `approved_hours` in the body: the server settles it against attendance as
    // min(requested, attended) — that derivation is the point of the action.
    reconcile.mutate(
      { params: { id }, body: {} },
      { onSuccess: () => toast({ tone: "success", title: t("approvals.otReconciled") }) },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("approvals.otTitle")}</h1>
        <PermissionButton required="hr.employee.manage" onClick={() => setCreateOpen(true)}>
          {t("otCreate.newButton")}
        </PermissionButton>
      </div>

      <DataTable
        data={rows}
        columns={[
          textColumn<OtRow>("employeeName", { header: t("approvals.columnEmployee") }),
          textColumn<OtRow>("workDate", { header: t("approvals.columnWorkDate") }),
          textColumn<OtRow>("window", { header: t("approvals.columnWindow"), secondary: true }),
          textColumn<OtRow>("rateType", { header: t("approvals.columnRateType"), secondary: true }),
          textColumn<OtRow>("approvedHours", { header: t("approvals.columnApprovedHours") }),
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
          // Offered only in the state the server accepts — approve is SUBMITTED-only and
          // reconcile APPROVED-only, both 409 otherwise (ot.service.ts).
          ...(row.status === "SUBMITTED"
            ? [
                {
                  key: "approve",
                  label: t("approvals.approveAction"),
                  onClick: () => handleApprove(row.id),
                },
              ]
            : []),
          ...(row.status === "APPROVED"
            ? [
                {
                  key: "reconcile",
                  label: t("approvals.reconcileAction"),
                  onClick: () => handleReconcile(row.id),
                },
              ]
            : []),
        ]}
      />

      <Drawer open={Boolean(detail)} onOpenChange={(open) => !open && setDetailId(null)}>
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
                  <dt className="text-text-muted">{t("approvals.columnApprovedHours")}</dt>
                  <dd className="text-text-primary">{detail.approved_hours ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">{t("approvals.columnStatus")}</dt>
                  <dd>
                    <InkChip status={otRequestStatusToChip(detail.status)} />
                  </dd>
                </div>
              </dl>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleApprove(detail.id)}
                  disabled={detail.status !== "SUBMITTED"}
                  loading={approve.isPending}
                >
                  {t("approvals.approveAction")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleReconcile(detail.id)}
                  disabled={detail.status !== "APPROVED"}
                  loading={reconcile.isPending}
                >
                  {t("approvals.reconcileAction")}
                </Button>
              </div>
            </DrawerBody>
          )}
        </DrawerContent>
      </Drawer>

      <CreateOtRequestDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
