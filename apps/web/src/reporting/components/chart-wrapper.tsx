import * as React from "react";
import { ResponsiveContainer } from "recharts";

/**
 * Categorical chart palette (M6 §1.1, design FD10) — status inks plus cyan/violet, referenced as
 * semantic CSS custom properties (never raw hex — `styleTokenBoundaries` lint-bans primitives
 * here too). Consumers cycle through this by index for `<Bar fill>`/`<Line stroke>`/`<Pie
 * fill>` series, so charts re-theme with light/dark and stay on-brand automatically.
 */
export const REPORTING_CHART_PALETTE: readonly string[] = [
  "var(--color-accent)", // cyan — primary series
  "var(--chip-outsourced)", // violet
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
  "var(--chip-pending)", // ink — neutral / other
];

/** Grid line color, shared by every `CartesianGrid` (never raw hex). */
export const CHART_GRID_STROKE = "var(--color-border)";
/** Axis tick/label color, shared by every `XAxis`/`YAxis` (never raw hex). */
export const CHART_AXIS_TEXT = "var(--color-text-secondary)";
/** `recharts` `Tooltip`'s `contentStyle`, token-themed so it matches the surrounding surface. */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  color: "var(--color-text-primary)",
};

export interface ChartWrapperProps {
  /** Fixed pixel height — `recharts`' `ResponsiveContainer` needs an explicit height or a sized parent. */
  height?: number;
  /** A single `recharts` chart element (`BarChart`/`LineChart`/`PieChart`/…). */
  children: React.ReactElement;
  className?: string;
}

/**
 * Token-themed `recharts` wrapper (M6 §1.1) — every chart in the reporting module renders through
 * this so sizing stays consistent and theming is zero-effort: colors are always CSS custom
 * properties (`REPORTING_CHART_PALETTE`/`CHART_GRID_STROKE`/`CHART_AXIS_TEXT`/
 * `CHART_TOOLTIP_STYLE`), so a chart re-themes on light/dark with no chart-specific logic.
 * `ChartPanel` (§3.2) composes this with cross-filter click-through.
 */
export function ChartWrapper({ height = 240, children, className }: ChartWrapperProps) {
  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
