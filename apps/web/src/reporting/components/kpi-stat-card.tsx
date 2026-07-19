import * as React from "react";
import { AreaChart, Area } from "recharts";
import type { Permission } from "@erp/contracts";
import { format, groupDigits } from "@erp/utils";
import { MaskedValue, Skeleton, cn } from "@erp/ui";
import { ChartWrapper } from "./chart-wrapper.js";

export type KpiValueFormat = "money" | "qty" | "number";

/** Percent change vs. the prior period, e.g. `12.4` or `-3.1`. */
export interface KpiDelta {
  percent: number;
}

export interface KpiStatCardLabels {
  /** Screen-reader text when the value is masked; defaults to naming the required permission. */
  restricted: string;
}

const defaultLabels: KpiStatCardLabels = {
  restricted: "Restricted — requires cost access",
};

const FORMAT_SCALE: Record<KpiValueFormat, number> = { money: 4, qty: 6, number: 0 };

/** Round to the format's scale (no float) and group the integer part; returns sign separately. */
function formatMagnitude(value: string | number, valueFormat: KpiValueFormat) {
  const scale = FORMAT_SCALE[valueFormat];
  const grouped = groupDigits(format(value, scale));
  const negative = grouped.startsWith("-");
  return { magnitude: negative ? grouped.slice(1) : grouped, negative };
}

export interface KpiStatCardProps {
  label: string;
  /** The KPI figure — a decimal string for `money`/`qty`, or a plain number for `number`. */
  value: string | number;
  format?: KpiValueFormat;
  /** Currency symbol for `format="money"`. */
  currency?: string;
  /** Unit label for `format="qty"`. */
  unit?: string;
  /** Change vs. the prior period; renders a ▲/▼ glyph so the signal is never color-only. */
  delta?: KpiDelta;
  /** Recent values for the trend sparkline (oldest first). */
  sparkline?: number[];
  /** Gates the value, delta, and sparkline behind `MaskedValue` (design MD2 cost/profit masking). */
  permission?: Permission;
  loading?: boolean;
  labels?: Partial<KpiStatCardLabels>;
  className?: string;
}

/**
 * KPI/stat card (M6 §3.1, design MD2): a big tabular number, a ▲/▼ delta (never color-only), and a
 * trend sparkline. Cost/profit KPIs pass `permission` (e.g. `inventory.cost.view`) — without it the
 * figure, delta, and sparkline render behind `MaskedValue`'s lock, same layout slot either way.
 */
export function KpiStatCard({
  label,
  value,
  format: valueFormat = "number",
  currency = "฿",
  unit,
  delta,
  sparkline,
  permission,
  loading = false,
  labels: labelsProp,
  className,
}: KpiStatCardProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-2 rounded-md border border-border bg-bg-surface p-4", className)}>
        <Skeleton variant="line" className="w-24" />
        <Skeleton variant="line" className="h-7 w-32" />
        <Skeleton variant="block" className="h-10" />
      </div>
    );
  }

  const { magnitude, negative } = formatMagnitude(value, valueFormat);
  const prefix = valueFormat === "money" ? currency : "";
  const suffix = valueFormat === "qty" && unit ? ` ${unit}` : "";
  const body = `${prefix}${magnitude}${suffix}`;

  const content = (
    <div className="flex flex-col gap-2">
      <span
        className={cn(
          "block font-numeric text-h1 font-semibold leading-tight tabular-nums text-text-primary",
          negative && "text-danger",
        )}
      >
        {negative ? `(${body})` : body}
      </span>
      {delta && <KpiDeltaIndicator delta={delta} />}
      {sparkline && sparkline.length > 1 && <KpiSparkline values={sparkline} negative={delta ? delta.percent < 0 : false} />}
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-1 rounded-md border border-border bg-bg-surface p-4", className)}>
      <span className="text-caption font-medium text-text-secondary">{label}</span>
      {permission ? (
        <MaskedValue permission={permission} value={content} restrictedLabel={labels.restricted} />
      ) : (
        content
      )}
    </div>
  );
}

function KpiDeltaIndicator({ delta }: { delta: KpiDelta }) {
  const up = delta.percent >= 0;
  const glyph = up ? "▲" : "▼";
  const magnitude = Math.abs(delta.percent).toFixed(1);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 text-caption font-medium tabular-nums",
        up ? "text-success" : "text-danger",
      )}
    >
      <span aria-hidden>{glyph}</span>
      {magnitude}%
    </span>
  );
}

/** Purely decorative (the value + `KpiDeltaIndicator`'s ▲/▼ already carry the trend), so it's
 * `aria-hidden` rather than an unlabeled image in the accessibility tree (M6 §5.2). */
function KpiSparkline({ values, negative }: { values: number[]; negative: boolean }) {
  const data = values.map((v, i) => ({ i, v }));
  const stroke = negative ? "var(--color-danger)" : "var(--color-accent)";
  return (
    <div aria-hidden="true">
      <ChartWrapper height={40}>
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            fill={stroke}
            fillOpacity={0.15}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartWrapper>
    </div>
  );
}
