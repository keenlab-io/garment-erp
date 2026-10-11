import * as React from "react";
import { useTranslation } from "react-i18next";
import { TenantStatus, type TenantListItem } from "@erp/contracts";
import {
  Button,
  FormField,
  InkChip,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "@erp/ui";
import { tenantStatusToChip } from "../tenant-status-chip.js";
import { useExportTenantMutation, usePurgeTenantMutation, useSetTenantStatusMutation } from "../queries.js";
import { useTenantStatusLabel } from "../use-tenant-status-label.js";

const STATUSES = Object.values(TenantStatus);

/** Lifecycle actions for one tenant (M8 §7.1, design D6/D9): status change (reason required), PDPA export, purge. */
export function LifecycleSection({
  tenant,
  onChanged,
}: {
  tenant: TenantListItem;
  /** Called with the updated row after a status change, so the parent drawer re-renders it. */
  onChanged: (tenant: TenantListItem) => void;
}) {
  const { t } = useTranslation("platform");
  const { toast } = useToast();
  const statusLabel = useTenantStatusLabel();
  const setStatus = useSetTenantStatusMutation();
  const exportTenant = useExportTenantMutation();
  const purge = usePurgeTenantMutation();

  const [nextStatus, setNextStatus] = React.useState<TenantStatus>(tenant.status);
  const [reason, setReason] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  function applyStatus(event: React.FormEvent) {
    event.preventDefault();
    setStatus.mutate(
      { params: { id: tenant.id }, body: { status: nextStatus, reason } },
      {
        onSuccess: (result) => {
          toast({ tone: "success", title: t("lifecycle.applied") });
          onChanged(result.body.tenant);
          setReason("");
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      <h2 className="text-body-strong text-text-primary">{t("lifecycle.heading")}</h2>
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        {t("lifecycle.current")}
        <InkChip status={tenantStatusToChip(tenant.status)} label={statusLabel(tenant.status)} />
      </div>

      <form onSubmit={applyStatus} className="flex flex-col gap-3">
        {setStatus.isError && (
          <p role="alert" className="text-sm text-danger">
            {t("lifecycle.error")}
          </p>
        )}
        <FormField label={t("lifecycle.newStatus")}>
          <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as TenantStatus)}>
            <SelectTrigger aria-label={t("lifecycle.newStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t("lifecycle.reason")} required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
        </FormField>
        <div>
          <Button
            type="submit"
            loading={setStatus.isPending}
            disabled={!reason.trim() || nextStatus === tenant.status}
          >
            {t("lifecycle.apply")}
          </Button>
        </div>
      </form>

      <div>
        <Button
          variant="secondary"
          loading={exportTenant.isPending}
          onClick={() =>
            exportTenant.mutate(
              { params: { id: tenant.id } },
              { onSuccess: () => toast({ tone: "success", title: t("lifecycle.exportQueued") }) },
            )
          }
        >
          {t("lifecycle.export")}
        </Button>
        {exportTenant.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {t("lifecycle.actionError")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-body-strong text-danger">{t("lifecycle.purgeHeading")}</h3>
        <p className="text-sm text-text-secondary">{t("lifecycle.purgeHint", { slug: tenant.slug })}</p>
        <FormField label={t("lifecycle.purgeConfirm")}>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={tenant.status !== TenantStatus.SUSPENDED}
            className="font-mono"
          />
        </FormField>
        {purge.isError && (
          <p role="alert" className="text-sm text-danger">
            {t("lifecycle.actionError")}
          </p>
        )}
        <div>
          <Button
            variant="destructive"
            loading={purge.isPending}
            disabled={tenant.status !== TenantStatus.SUSPENDED || confirm !== tenant.slug}
            onClick={() =>
              purge.mutate(
                { params: { id: tenant.id }, body: { confirm } },
                {
                  onSuccess: () => {
                    toast({ tone: "success", title: t("lifecycle.purgeQueued") });
                    setConfirm("");
                  },
                },
              )
            }
          >
            {t("lifecycle.purge")}
          </Button>
        </div>
      </div>
    </section>
  );
}
