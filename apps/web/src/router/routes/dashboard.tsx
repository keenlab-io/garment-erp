import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { usePermissions } from "@erp/ui";
import { KpiStatCard } from "../../reporting/components/kpi-stat-card.js";
import { ChartPanel } from "../../reporting/components/chart-panel.js";
import { ActiveFilterChipRail } from "../../reporting/components/active-filter-chip-rail.js";
import { AlertsPanel } from "../../reporting/components/alerts-panel.js";
import { useDashboardFilter, useDashboardQuery } from "../../reporting/queries.js";
import { dimensionFilterValue, panelChartConfig, panelHeadlineTotal, panelResult } from "../../reporting/dashboard-panels.js";
import {
  financeAlertsFromAging,
  productionAlertsFromTimeline,
  stockAlertsFromLowStock,
} from "../../reporting/alerts.js";
import { useItemsQuery, useLowStockReportQuery } from "../../inventory/queries.js";
import { useWorkOrderTimelineQuery } from "../../production/queries.js";
import { useAgingReportQuery } from "../../sales/queries.js";

interface DashboardCard {
  key: string;
  title: string;
  query: ReturnType<typeof useDashboardQuery>;
  permission?: "inventory.cost.view";
}

/**
 * The Overview dashboard (M6 §4.1, design MD1/MD2/MD3/MD6) — the Owner's daily glance. `/` doubles
 * as this screen (route-tree.tsx); it's ungated (every authenticated user lands here), so each
 * section only renders for the report groups the viewer actually holds `report.<group>.view` for.
 * Cost/profit KPIs additionally need `inventory.cost.view`: the backend 403s a cost/profit
 * dashboard wholesale without it (`apps/api/src/reporting/report-access.ts`), so those two queries
 * only *fire* when the viewer holds it — `KpiStatCard`'s built-in `MaskedValue` then renders the
 * lock in the same layout slot either way (design MD2). KPI cards render first (mobile glance),
 * each with its own `loading` flag so no single slow group blocks the rest (design MD6).
 */
export function DashboardPage() {
  const { t } = useTranslation("reporting");
  const { has } = usePermissions();
  const navigate = useNavigate();
  const { filter, setFilter, clearFilter } = useDashboardFilter("/");

  const hasCostAccess = has("inventory.cost.view");
  const access = {
    inventory: has("report.inventory.view"),
    sales: has("report.sales.view"),
    cost: has("report.cost.view"),
    profit: has("report.profit.view"),
    tax: has("report.tax.view"),
  };

  const inventoryDashboard = useDashboardQuery("inventory", filter, { enabled: access.inventory });
  const salesDashboard = useDashboardQuery("sales", filter, { enabled: access.sales });
  const costDashboard = useDashboardQuery("cost", filter, { enabled: access.cost && hasCostAccess });
  const profitDashboard = useDashboardQuery("profit", filter, { enabled: access.profit && hasCostAccess });
  const taxDashboard = useDashboardQuery("tax", filter, { enabled: access.tax });

  const cardCandidates: Array<DashboardCard | false> = [
    access.inventory && { key: "inventory", title: t("nav.dashboardInventory"), query: inventoryDashboard },
    access.sales && { key: "sales", title: t("nav.dashboardSales"), query: salesDashboard },
    access.cost && { key: "cost", title: t("nav.dashboardCost"), query: costDashboard, permission: "inventory.cost.view" as const },
    access.profit && { key: "profit", title: t("nav.dashboardProfit"), query: profitDashboard, permission: "inventory.cost.view" as const },
    access.tax && { key: "tax", title: t("nav.dashboardTax"), query: taxDashboard },
  ];
  const cards = cardCandidates.filter((card): card is DashboardCard => card !== false);

  const salesPanel = salesDashboard.data?.body.panels.find((p) => p.key === "sales.overview");
  const salesResult = salesPanel && panelResult(salesPanel);
  const salesChart = salesResult && panelChartConfig(salesResult.columns, salesResult.rows);
  const salesDimension = salesChart?.dimension;

  const itemsQuery = useItemsQuery({ limit: 200 });
  const lowStockQuery = useLowStockReportQuery();
  const timelineQuery = useWorkOrderTimelineQuery();
  const agingQuery = useAgingReportQuery();
  const itemNameById = React.useMemo(
    () => new Map((itemsQuery.data?.body.data ?? []).map((item) => [item.id, item.name])),
    [itemsQuery.data],
  );
  const alerts = React.useMemo(
    () => [
      ...stockAlertsFromLowStock(lowStockQuery.data?.body.rows ?? [], itemNameById),
      ...productionAlertsFromTimeline(timelineQuery.data?.body.data ?? []),
      ...financeAlertsFromAging(agingQuery.data?.body.rows ?? []),
    ],
    [lowStockQuery.data, timelineQuery.data, agingQuery.data, itemNameById],
  );
  const alertsLoading = lowStockQuery.isLoading || timelineQuery.isLoading || agingQuery.isLoading;

  const chips = filter.dimension && filter.value ? [{ key: filter.dimension, label: `${filter.dimension}: ${filter.value}` }] : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("overview.title")}</h1>

      <ActiveFilterChipRail chips={chips} onClear={clearFilter} />

      {cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => {
            const panel = card.query.data?.body.panels[0];
            const headline = panel && panelHeadlineTotal(panelResult(panel).columns, panelResult(panel).totals);
            return (
              <KpiStatCard
                key={card.key}
                label={card.title}
                value={headline?.value ?? "0"}
                format="money"
                loading={card.query.isLoading}
                permission={card.permission}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted">{t("overview.noAccess")}</p>
      )}

      {salesChart && salesResult && (
        <ChartPanel
          title={t("overview.salesTrend")}
          kind={salesChart.kind}
          data={salesResult.rows}
          xKey={salesChart.xKey}
          series={salesChart.series}
          activeValue={filter.value}
          loading={salesDashboard.isLoading}
          onSelect={
            salesDimension
              ? (value) => setFilter({ dimension: salesDimension, value: dimensionFilterValue(salesDimension, value) })
              : undefined
          }
        />
      )}

      <AlertsPanel
        title={t("overview.alerts")}
        alerts={alerts}
        loading={alertsLoading}
        onSelect={(alert) => void navigate({ to: alert.href })}
      />
    </div>
  );
}
