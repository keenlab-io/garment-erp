import type { AgingReportRow, LowStockRow, WorkOrderTimelineEntry } from "@erp/contracts";
import type { ReportingAlert } from "./components/alerts-panel.js";

/** Low-stock rows (M3 `inventory.lowStockReport`) → alerts panel entries. Titled by item name when
 * the caller has it looked up (falls back to the item id, same convention as `inventory/reports.tsx`
 * `itemNameById`); `description` shows on-hand vs. the minimum so the shortfall reads at a glance. */
export function stockAlertsFromLowStock(
  rows: readonly LowStockRow[],
  itemNameById: ReadonlyMap<string, string>,
): ReportingAlert[] {
  return rows.map((row) => ({
    id: `${row.item_id}:${row.warehouse_id ?? "-"}`,
    source: "stock",
    status: "stock-near-min",
    title: itemNameById.get(row.item_id) ?? row.item_id,
    description: `${row.on_hand} / ${row.min_stock}`,
    href: `/inventory/items/${row.item_id}`,
  }));
}

/** Delayed work-order steps (M4 `production.workOrderTimeline`) → one alert per delayed step,
 * mirroring `production/components/alert-rail.tsx`'s `deriveDelayedStepAlerts` but adding the
 * work-order id `href` that component leaves to its caller. */
export function productionAlertsFromTimeline(
  entries: readonly WorkOrderTimelineEntry[],
): ReportingAlert[] {
  const alerts: ReportingAlert[] = [];
  for (const entry of entries) {
    for (const step of entry.steps) {
      if (!step.is_delayed) continue;
      alerts.push({
        id: step.id,
        source: "production",
        status: "delayed",
        title: `${entry.wo_no} · ${step.name}`,
        description: `${step.standard_time_min}m standard`,
        href: `/production/work-orders/${entry.id}`,
      });
    }
  }
  return alerts;
}

/** Customers carrying a 90+ day overdue balance (M5 `sales.agingReport`) → alerts panel entries. */
export function financeAlertsFromAging(rows: readonly AgingReportRow[]): ReportingAlert[] {
  return rows
    .filter((row) => Number(row.over_90) > 0)
    .map((row) => ({
      id: row.customer_id,
      source: "finance",
      status: "overdue",
      title: row.customer_name,
      description: row.over_90,
      href: `/sales/customers/${row.customer_id}`,
    }));
}
