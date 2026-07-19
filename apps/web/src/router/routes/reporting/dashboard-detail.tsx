import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useMatches } from "@tanstack/react-router";
import { usePermissions } from "@erp/ui";
import { reportDashboardPath } from "../../../nav/reporting-paths.js";
import { KpiStatCard } from "../../../reporting/components/kpi-stat-card.js";
import { ChartPanel } from "../../../reporting/components/chart-panel.js";
import { ActiveFilterChipRail } from "../../../reporting/components/active-filter-chip-rail.js";
import { useDashboardFilter, useDashboardQuery } from "../../../reporting/queries.js";
import { dimensionFilterValue, panelChartConfig, panelHeadlineTotal, panelResult } from "../../../reporting/dashboard-panels.js";
import { reportKeyLabelKey } from "../../../reporting/report-catalog.js";
import type { ReportingKey } from "../../../i18n/keys.js";

const COST_GATED_GROUPS = new Set(["cost", "profit"]);

/**
 * A domain dashboard (M6 §4.1, design MD1/MD2/MD4) — one card per report-catalog panel in the
 * group (`apps/api/src/reporting/dashboard-catalog.ts`), each a headline `KpiStatCard` plus, when
 * the panel's rows chart, a cross-filter-aware `ChartPanel`; a "View report" link drills to the
 * full `ReportDataTable` (M6 §4.2) carrying the same active slice. `route-tree.tsx` registers this
 * component once for all five `REPORTING_DASHBOARD_ROUTES` (their paths are static per group, not
 * a `$param`), so the group is read back off the route's own `staticData.reportGroup`.
 *
 * Cost/profit dashboards 403 wholesale from the backend without `inventory.cost.view` (design MD2;
 * `apps/api/src/reporting/report-access.ts`) — the query only fires when the viewer holds it, and
 * a single masked `KpiStatCard` stands in for the panel grid otherwise.
 */
export function ReportDashboardPage() {
  const { t } = useTranslation(["reporting"]);
  const { has } = usePermissions();
  const matches = useMatches();
  const leaf = matches.at(-1);
  const group = leaf?.staticData?.reportGroup ?? "";
  const titleKey = leaf?.staticData?.title;
  const title = titleKey ? t(titleKey as ReportingKey) : "";

  const { filter, setFilter, clearFilter } = useDashboardFilter(reportDashboardPath(group));

  const costGated = COST_GATED_GROUPS.has(group);
  const enabled = !costGated || has("inventory.cost.view");

  const dashboard = useDashboardQuery(group, filter, { enabled });
  const panels = dashboard.data?.body.panels ?? [];

  const chips = filter.dimension && filter.value ? [{ key: filter.dimension, label: `${filter.dimension}: ${filter.value}` }] : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{title}</h1>

      <ActiveFilterChipRail chips={chips} onClear={clearFilter} />

      {!enabled ? (
        <KpiStatCard label={title} value="0" format="money" permission="inventory.cost.view" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {dashboard.isLoading ? (
            <>
              <KpiStatCard label="" value="0" loading />
              <KpiStatCard label="" value="0" loading />
            </>
          ) : (
            panels.map((panel) => {
              const result = panelResult(panel);
              const headline = panelHeadlineTotal(result.columns, result.totals);
              const chart = panelChartConfig(result.columns, result.rows);
              const dimension = chart?.dimension;
              const label = t(reportKeyLabelKey(panel.key));
              return (
                <div key={panel.key} className="flex flex-col gap-3 rounded-md border border-border bg-bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-body-strong text-text-primary">{label}</h2>
                    <Link
                      to="/reports/$reportKey"
                      params={{ reportKey: panel.key }}
                      search={{ dimension: filter.dimension, value: filter.value }}
                      className="text-caption text-accent underline"
                    >
                      {t("dashboard.viewReport")}
                    </Link>
                  </div>
                  <KpiStatCard
                    label={headline?.label ?? label}
                    value={headline?.value ?? "0"}
                    format="money"
                    permission={costGated ? "inventory.cost.view" : undefined}
                  />
                  {chart && (
                    <ChartPanel
                      title={t("dashboard.trend")}
                      kind={chart.kind}
                      data={result.rows}
                      xKey={chart.xKey}
                      series={chart.series}
                      activeValue={filter.value}
                      onSelect={
                        dimension
                          ? (value) => setFilter({ dimension, value: dimensionFilterValue(dimension, value) })
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
