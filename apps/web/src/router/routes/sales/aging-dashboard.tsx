import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { AgingReportRow } from "@erp/contracts";
import { sumMoney } from "@erp/utils";
import { DataTable, FormField, Input, MoneyCell, moneyColumn, textColumn } from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { AGING_BUCKET_LABEL_KEY } from "../../../sales/aging-labels.js";
import { useAgingReportQuery } from "../../../sales/queries.js";

const BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "over_90"] as const;

/** The AR aging dashboard (M5 §4.5) — outstanding balance by credit-terms bucket, straight off
 * the `agingReport` contract endpoint (no read gap here, unlike the rest of M5 §4). */
export function AgingDashboardPage() {
  const { t } = useTranslation("sales");
  const { density } = useDensity();
  const [asOf, setAsOf] = React.useState("");

  const agingQuery = useAgingReportQuery(asOf ? { as_of: new Date(`${asOf}T23:59:59`).toISOString() } : {});
  const rows = agingQuery.data?.body.rows ?? [];

  const totals = React.useMemo(
    () => Object.fromEntries(BUCKETS.map((bucket) => [bucket, sumMoney(rows.map((r) => r[bucket]))])) as Record<(typeof BUCKETS)[number], string>,
    [rows],
  );

  const columns = React.useMemo<ColumnDef<AgingReportRow>[]>(
    () => [
      textColumn<AgingReportRow>("customer_name", { header: t("aging.columnCustomer") }),
      ...BUCKETS.map((bucket) => moneyColumn<AgingReportRow>(bucket, { header: t(AGING_BUCKET_LABEL_KEY[bucket]), secondary: bucket === "current" })),
    ],
    [t],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("aging.title")}</h1>
        <FormField label={t("aging.asOfLabel")} className="w-44">
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </FormField>
      </div>

      {rows.length > 0 && (
        <dl className="grid grid-cols-5 gap-3 rounded-lg border border-border bg-bg-surface p-4 text-sm shadow-sm">
          {BUCKETS.map((bucket) => (
            <div key={bucket} className="flex flex-col gap-1">
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t(AGING_BUCKET_LABEL_KEY[bucket])}</dt>
              <dd className="text-body-strong font-semibold text-text-primary">
                <MoneyCell value={totals[bucket]} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.customer_id}
        tableId="sales-aging"
        density={density}
        isLoading={agingQuery.isLoading}
        error={agingQuery.isError ? { message: t("aging.loadError") } : null}
        onRetry={() => agingQuery.refetch()}
        emptyState={{ title: t("aging.empty") }}
      />
    </div>
  );
}
