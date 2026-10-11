import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { TenantStatus, type TenantListItem } from "@erp/contracts";
import {
  Button,
  DataTable,
  InkChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  textColumn,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { useTenantsQuery } from "../../../platform/queries.js";
import { tenantStatusToChip } from "../../../platform/tenant-status-chip.js";
import { useTenantStatusLabel } from "../../../platform/use-tenant-status-label.js";
import { ProvisionTenantDrawer } from "../../../platform/components/provision-tenant-drawer.js";
import { ManageTenantDrawer } from "../../../platform/components/manage-tenant-drawer.js";
import { PlatformLayout } from "./platform-layout.js";

const STATUS_FILTERS: Array<TenantStatus | "ALL"> = ["ALL", ...Object.values(TenantStatus)];

/** The platform tenants list (M8 §7.1): filter, provision, and open the per-tenant manage drawer. */
export function PlatformTenantsPage() {
  const { t } = useTranslation("platform");
  const { density } = useDensity();
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  const statusLabel = useTenantStatusLabel();

  const [statusFilter, setStatusFilter] = React.useState<TenantStatus | "ALL">("ALL");
  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([undefined]);
  const [provisionOpen, setProvisionOpen] = React.useState(false);
  const [managing, setManaging] = React.useState<TenantListItem | null>(null);
  const cursor = cursorStack[cursorStack.length - 1];

  const tenants = useTenantsQuery({
    ...(cursor ? { cursor } : {}),
    ...(statusFilter === "ALL" ? {} : { "filter[status]": statusFilter }),
  });

  React.useEffect(() => {
    setCursorStack([undefined]);
  }, [statusFilter]);

  const rows = React.useMemo(() => tenants.data?.body.data ?? [], [tenants.data]);

  const columns = React.useMemo<ColumnDef<TenantListItem>[]>(
    () => [
      textColumn<TenantListItem>("name", { header: t("tenants.columnName"), sortable: true }),
      textColumn<TenantListItem>("slug", { header: t("tenants.columnSlug"), mono: true }),
      textColumn<TenantListItem>("kind", { header: t("tenants.columnKind"), secondary: true }),
      {
        id: "status",
        header: t("tenants.columnStatus"),
        cell: ({ row }) => (
          <InkChip status={tenantStatusToChip(row.original.status)} label={statusLabel(row.original.status)} />
        ),
      },
      {
        id: "created",
        header: t("tenants.columnCreated"),
        meta: { secondary: true },
        cell: ({ row }) => dateFormat.format(new Date(row.original.created_at)),
      },
    ],
    [t, statusLabel, dateFormat],
  );

  const nextCursor = tenants.data?.body.next_cursor ?? null;

  return (
    <PlatformLayout>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-h1 font-semibold text-text-primary">{t("tenants.title")}</h1>
          <Button onClick={() => setProvisionOpen(true)}>{t("tenants.provision")}</Button>
        </div>

        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          density={density}
          isLoading={tenants.isLoading}
          error={tenants.isError ? { message: t("tenants.loadError") } : null}
          onRetry={() => tenants.refetch()}
          emptyState={{ title: t("tenants.empty") }}
          nextCursor={nextCursor}
          onNextPage={() => {
            if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
          }}
          onPrevPage={cursorStack.length > 1 ? () => setCursorStack((stack) => stack.slice(0, -1)) : undefined}
          rowActions={(row) => [
            { key: "manage", label: t("tenants.manageAction"), onClick: () => setManaging(row) },
          ]}
          toolbar={
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as TenantStatus | "ALL")}
            >
              <SelectTrigger aria-label={t("tenants.filterStatusLabel")} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "ALL" ? t("tenants.filterStatusAll") : statusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </div>

      <ProvisionTenantDrawer open={provisionOpen} onOpenChange={setProvisionOpen} />
      <ManageTenantDrawer tenant={managing} onClose={() => setManaging(null)} />
    </PlatformLayout>
  );
}
