import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { PayrollRunStatus } from "@erp/contracts";
import { Button, DataTable, FormField, Input, statusColumn, textColumn, useToast } from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useCreatePayrollRunMutation, usePayrollRunsQuery } from "../../../hr/queries.js";
import { payrollRunStatusToChip } from "../../../hr/chip-status.js";

interface PayrollRunRow {
  id: string;
  period: string;
  status: PayrollRunStatus;
}

/**
 * The payroll run list (M2 §4.2): every run, newest period first, plus a "Create run" form for
 * the next `YYYY-MM` period. Row selection opens the run workspace (wizard).
 */
export function PayrollRunsListPage() {
  const { t } = useTranslation("hr");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { density } = useDensity();

  const runs = usePayrollRunsQuery();
  const createRun = useCreatePayrollRunMutation();
  const [period, setPeriod] = React.useState("");

  const rows = React.useMemo<PayrollRunRow[]>(
    () => (runs.data?.body.payroll_runs ?? []).map((r) => ({ id: r.id, period: r.period, status: r.status })),
    [runs.data],
  );

  const columns = React.useMemo<ColumnDef<PayrollRunRow>[]>(
    () => [
      textColumn<PayrollRunRow>("period", { header: t("payroll.columnPeriod"), mono: true }),
      statusColumn<PayrollRunRow, PayrollRunStatus>("status", {
        header: t("payroll.columnStatus"),
        resolve: payrollRunStatusToChip,
      }),
    ],
    [t],
  );

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    createRun.mutate(
      { body: { period } },
      {
        onSuccess: (result) => {
          toast({ tone: "success", title: t("payroll.runCreated", { period }) });
          setPeriod("");
          void navigate({ to: "/hr/payroll/runs/$id", params: { id: result.body.payroll_run.id } });
        },
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("payroll.title")}</h1>
        <form onSubmit={handleCreate} className="flex items-end gap-2">
          <FormField label={t("payroll.newRunPeriod")}>
            <Input
              placeholder="YYYY-MM"
              pattern="\d{4}-\d{2}"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              required
            />
          </FormField>
          <Button type="submit" loading={createRun.isPending}>
            {t("payroll.createRun")}
          </Button>
        </form>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        density={density}
        isLoading={runs.isLoading}
        error={runs.isError ? { message: t("payroll.loadError") } : null}
        onRetry={() => runs.refetch()}
        emptyState={{ title: t("payroll.empty") }}
        rowActions={(row) => [
          {
            key: "open",
            label: t("payroll.openAction"),
            onClick: () => void navigate({ to: "/hr/payroll/runs/$id", params: { id: row.id } }),
          },
        ]}
      />
    </div>
  );
}
