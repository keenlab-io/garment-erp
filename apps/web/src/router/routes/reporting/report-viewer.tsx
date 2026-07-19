import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { ReportRow } from "@erp/contracts";
import { FormField, Input } from "@erp/ui";
import { ActiveFilterChipRail } from "../../../reporting/components/active-filter-chip-rail.js";
import { ReportDataTable } from "../../../reporting/components/report-data-table.js";
import { useReportFilter, useReportQuery } from "../../../reporting/queries.js";
import { useFilterChips } from "../../../reporting/use-filter-chips.js";
import { reportKeyLabelKey } from "../../../reporting/report-catalog.js";

/** A row's drill-down target (design MD4) — only the ids a screen actually has a detail route for;
 * a report whose rows carry neither falls back to no row action (`ReportDataTable` hides it). */
function drillDownHref(row: ReportRow): string | undefined {
  if (typeof row.item_id === "string") return `/inventory/items/${row.item_id}`;
  if (typeof row.customer_id === "string") return `/sales/customers/${row.customer_id}`;
  return undefined;
}

/** `ReportFilterSearch`'s fields are all optional (absent keys, not `undefined` values, are how
 * the URL search-params codec represents "unset") — the contract's `ReportQuery` catchall requires
 * every present key to be a defined `string`, so this strips any explicitly-`undefined` entries
 * before the query fires. */
function definedQuery(filter: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/**
 * The report viewer (M6 §4.2 report-viewer-ui, design MD4) — one screen for all 16 report-catalog
 * keys, browsed from the Reports home (`reports-home.tsx`) or drilled into from a dashboard panel
 * (`dashboard-detail.tsx`). `ReportDataTable` already carries the totals strip, drill-down row
 * action, and the async PDF/Excel/CSV export menu (M6 §3.4) — this screen only supplies the
 * report's own `{ columns, rows, totals }` and the `from`/`to`/`dimension`/`value` filter chrome.
 * Editing From/To by hand clears any inherited `(dimension, value)` slice, since the backend's
 * window resolver prefers `dimension` when both are present (`report-window.ts`).
 */
export function ReportViewerPage() {
  const { t } = useTranslation(["reporting"]);
  const navigate = useNavigate();
  const { reportKey } = useParams({ from: "/reports/$reportKey" });
  const { filter, setFilter, clearFilter } = useReportFilter();

  const report = useReportQuery(reportKey, definedQuery(filter));
  const drillable = (report.data?.body.columns ?? []).some((c) => c.key === "item_id" || c.key === "customer_id");

  const chips = useFilterChips(filter.dimension, filter.value);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t(reportKeyLabelKey(reportKey))}</h1>

      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t("viewer.fromLabel")}>
          <Input
            type="date"
            value={filter.from ?? ""}
            onChange={(e) => setFilter({ ...filter, from: e.target.value || undefined, dimension: undefined, value: undefined })}
          />
        </FormField>
        <FormField label={t("viewer.toLabel")}>
          <Input
            type="date"
            value={filter.to ?? ""}
            onChange={(e) => setFilter({ ...filter, to: e.target.value || undefined, dimension: undefined, value: undefined })}
          />
        </FormField>
      </div>

      <ActiveFilterChipRail
        chips={chips}
        onClear={clearFilter}
        labels={{ groupLabel: t("filters.groupLabel"), clear: t("filters.clear"), remove: (label) => t("filters.removeFilter", { label }) }}
      />

      <ReportDataTable
        columns={report.data?.body.columns ?? []}
        rows={report.data?.body.rows ?? []}
        totals={report.data?.body.totals}
        reportKey={reportKey}
        isLoading={report.isLoading}
        error={report.isError ? { message: t("viewer.loadError") } : null}
        onRetry={() => report.refetch()}
        onDrillDown={
          drillable
            ? (row) => {
                const href = drillDownHref(row);
                if (href) void navigate({ to: href });
              }
            : undefined
        }
        tableId={`report-${reportKey}`}
        labels={{
          exportAction: t("viewer.exportAction"),
          exportPending: (format) => t("viewer.exportPending", { format }),
          exportDone: t("viewer.exportDone"),
          exportFailed: t("viewer.exportFailed"),
          download: t("viewer.download"),
          totalsLabel: t("viewer.totalsLabel"),
          drillDown: t("viewer.drillDown"),
          emptyTitle: t("viewer.emptyTitle"),
        }}
      />
    </div>
  );
}
