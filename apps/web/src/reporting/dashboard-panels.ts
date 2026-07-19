import type { DashboardPanel, ReportColumn, ReportRow, ReportTotals } from "@erp/contracts";
import type { ChartKind, ChartSeries } from "./components/chart-panel.js";

/**
 * `DashboardPanel.data` is typed `z.record(z.unknown())` in the contract (kept framework-agnostic —
 * `packages/contracts/src/dto/reporting.ts`), but `apps/api`'s `DashboardService.get` always shapes
 * it as the applied window plus a plain report result (`apps/api/src/reporting/dashboard.service.ts`
 * `panels.push({ key: panelKey, data: { window, ...result } })`). This is the one place that
 * assumption is cast, so every M6 §4 screen reads panel data through it instead of re-casting.
 */
export interface DashboardPanelResult {
  window: { from?: string; to?: string };
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportTotals;
}

export function panelResult(panel: DashboardPanel): DashboardPanelResult {
  return panel.data as unknown as DashboardPanelResult;
}

function isNumericValue(value: string | number | null | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || value.trim() === "") return false;
  return Number.isFinite(Number(value));
}

/** The two `(dimension, value)` shapes `resolveWindow` actually understands server-side
 * (`apps/api/src/reporting/report-window.ts`) — every other dimension is a display-only grouping
 * with no backend filtering effect, so a panel's clicks only drive the cross-filter when its
 * leading column is one of these. */
export type PanelDimension = "day" | "month";

export interface PanelChartConfig {
  kind: ChartKind;
  xKey: string;
  series: ChartSeries[];
  /** Set only when the panel's category column maps to a window the backend resolves; omit to
   * still render the chart, just without cross-filter click-through. */
  dimension?: PanelDimension;
}

/** Derive a chart config from a panel/report's `{ columns, rows }` (M6 §4.1 dashboards-ui), or
 * `undefined` when there's no leading category column or no numeric series to plot against it. */
export function panelChartConfig(
  columns: readonly ReportColumn[],
  rows: readonly ReportRow[],
): PanelChartConfig | undefined {
  const [xColumn, ...rest] = columns;
  if (!xColumn) return undefined;
  const series = rest.filter((column) => rows.some((row) => isNumericValue(row[column.key])));
  if (series.length === 0) return undefined;
  const dimension: PanelDimension | undefined =
    xColumn.key === "d" ? "day" : xColumn.key === "m" ? "month" : undefined;
  return {
    kind: dimension ? "line" : "bar",
    xKey: xColumn.key,
    series: series.map((column) => ({ key: column.key, label: column.label })),
    dimension,
  };
}

/** Normalize a clicked category's raw cell value to the cross-filter `value` `resolveWindow`
 * expects — a `month` filter takes the `YYYY-MM` prefix of a `YYYY-MM-DD`/`YYYY-MM-01` cell. */
export function dimensionFilterValue(dimension: PanelDimension, raw: string): string {
  return dimension === "month" ? raw.slice(0, 7) : raw;
}

/** The headline figure for a panel's KPI card — its `totals`' first populated entry, in the
 * columns' declared order, or `undefined` when the panel has no numeric totals yet (an
 * uncatalogued report still resolves with zeroed totals, so this is rare but possible pre-M6
 * read-model completion). */
export function panelHeadlineTotal(
  columns: readonly ReportColumn[],
  totals: ReportTotals,
): { key: string; label: string; value: string } | undefined {
  for (const column of columns) {
    const value = totals[column.key];
    if (value !== undefined && value !== null) {
      return { key: column.key, label: column.label, value: String(value) };
    }
  }
  return undefined;
}
