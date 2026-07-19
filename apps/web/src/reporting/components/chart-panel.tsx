import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, Skeleton } from "@erp/ui";
import {
  CHART_AXIS_TEXT,
  CHART_GRID_STROKE,
  CHART_TOOLTIP_STYLE,
  ChartWrapper,
  REPORTING_CHART_PALETTE,
} from "./chart-wrapper.js";

export type ChartKind = "bar" | "line" | "pie";

export interface ChartSeries {
  /** The row key this series plots (a numeric report/panel column). */
  key: string;
  label: string;
}

export type ChartRow = Record<string, string | number | null>;

interface CategoryClickState {
  activeLabel?: string | number;
  activePayload?: Array<{ payload?: ChartRow }>;
}

/** Resolve the clicked category's dimension value from a `BarChart`/`LineChart` click state. */
export function categoryValueFromClick(state: CategoryClickState, xKey: string): string | undefined {
  const label = state?.activeLabel ?? state?.activePayload?.[0]?.payload?.[xKey];
  return label === undefined || label === null ? undefined : String(label);
}

/** Resolve the clicked slice's dimension value from a `Pie`'s click payload. */
export function categoryValueFromPieClick(
  entry: { payload?: ChartRow } & Record<string, unknown>,
  xKey: string,
): string | undefined {
  const raw = entry?.payload ?? entry;
  const value = raw?.[xKey] as string | number | null | undefined;
  return value === undefined || value === null ? undefined : String(value);
}

/** Cycles the shared categorical palette by series/slice index. */
export function seriesColor(index: number): string {
  return REPORTING_CHART_PALETTE[index % REPORTING_CHART_PALETTE.length] as string;
}

/** Dims every slice except the dashboard's active cross-filter value (design MD1's visible active slice). */
export function sliceOpacity(
  value: string | number | null | undefined,
  activeValue: string | undefined,
): number {
  if (!activeValue) return 1;
  return String(value) === activeValue ? 1 : 0.35;
}

export interface ChartPanelProps {
  title: string;
  kind: ChartKind;
  data: ChartRow[];
  /** The category/dimension each point plots against — the bar/line x-axis or pie slice name. */
  xKey: string;
  series: ChartSeries[];
  /** The dashboard's current cross-filter value for this dimension; the matching slice is emphasized. */
  activeValue?: string;
  /** Fired with the clicked category's value — design MD1 "clicking a dimension re-filters every panel". */
  onSelect?: (value: string) => void;
  height?: number;
  loading?: boolean;
  emptyLabel?: string;
  className?: string;
}

/**
 * A cross-filter-aware chart panel (M6 §3.2, design MD1/MD2/FD10) — `recharts` themed from tokens
 * via `ChartWrapper`, never raw hex. Clicking a bar/line point or pie slice reports its dimension
 * value through `onSelect` so the dashboard screen (M6 §4) can drive every panel from one filter;
 * `activeValue` dims every other slice so the applied selection stays visible on the panel itself.
 */
export function ChartPanel({
  title,
  kind,
  data,
  xKey,
  series,
  activeValue,
  onSelect,
  height = 240,
  loading = false,
  emptyLabel = "No data for this selection.",
  className,
}: ChartPanelProps) {
  const headingId = React.useId();
  return (
    <div className={cn("flex flex-col gap-2 rounded-md border border-border bg-bg-surface p-4", className)}>
      <h3 id={headingId} className="text-caption font-medium text-text-secondary">
        {title}
      </h3>
      {loading ? (
        <Skeleton variant="block" style={{ height }} />
      ) : data.length === 0 ? (
        <p className="py-8 text-center text-caption text-text-secondary">{emptyLabel}</p>
      ) : (
        <div role="img" aria-labelledby={headingId}>
          <ChartWrapper height={height}>
            {renderChart({ kind, data, xKey, series, activeValue, onSelect })}
          </ChartWrapper>
        </div>
      )}
    </div>
  );
}

function renderChart({
  kind,
  data,
  xKey,
  series,
  activeValue,
  onSelect,
}: Pick<ChartPanelProps, "kind" | "data" | "xKey" | "series" | "activeValue" | "onSelect">) {
  if (kind === "pie") {
    const [primary] = series;
    if (!primary) return <PieChart />;
    return (
      <PieChart>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ color: CHART_AXIS_TEXT }} />
        <Pie
          data={data}
          dataKey={primary.key}
          nameKey={xKey}
          onClick={(entry: { payload?: ChartRow } & Record<string, unknown>) => {
            const value = categoryValueFromPieClick(entry, xKey);
            if (value) onSelect?.(value);
          }}
        >
          {data.map((row, i) => (
            <Cell
              key={String(row[xKey] ?? i)}
              fill={seriesColor(i)}
              fillOpacity={sliceOpacity(row[xKey], activeValue)}
              cursor={onSelect ? "pointer" : undefined}
            />
          ))}
        </Pie>
      </PieChart>
    );
  }

  const handleClick = (state: CategoryClickState) => {
    const value = categoryValueFromClick(state, xKey);
    if (value) onSelect?.(value);
  };

  if (kind === "line") {
    return (
      <LineChart data={data} onClick={handleClick}>
        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tick={{ fill: CHART_AXIS_TEXT }} stroke={CHART_GRID_STROKE} />
        <YAxis tick={{ fill: CHART_AXIS_TEXT }} stroke={CHART_GRID_STROKE} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ color: CHART_AXIS_TEXT }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(i)}
            strokeWidth={2}
            dot={false}
            cursor={onSelect ? "pointer" : undefined}
          />
        ))}
      </LineChart>
    );
  }

  return (
    <BarChart data={data} onClick={handleClick}>
      <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
      <XAxis dataKey={xKey} tick={{ fill: CHART_AXIS_TEXT }} stroke={CHART_GRID_STROKE} />
      <YAxis tick={{ fill: CHART_AXIS_TEXT }} stroke={CHART_GRID_STROKE} />
      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
      <Legend wrapperStyle={{ color: CHART_AXIS_TEXT }} />
      {series.map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(i)} cursor={onSelect ? "pointer" : undefined}>
          {series.length === 1 &&
            data.map((row, rowIndex) => (
              <Cell
                key={String(row[xKey] ?? rowIndex)}
                fill={seriesColor(i)}
                fillOpacity={sliceOpacity(row[xKey], activeValue)}
              />
            ))}
        </Bar>
      ))}
    </BarChart>
  );
}
