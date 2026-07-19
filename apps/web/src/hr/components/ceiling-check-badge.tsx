import * as React from "react";
import { toDecimal } from "@erp/utils";
import { Badge, Icon, cn } from "@erp/ui";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export interface CeilingCheckBadgeLabels {
  within: string;
  approaching: string;
  over: string;
}

const defaultLabels: CeilingCheckBadgeLabels = {
  within: "Within ceiling",
  approaching: "Approaching ceiling",
  over: "Over ceiling",
};

export interface CeilingCheckBadgeProps {
  /** The requested/advanced amount, a decimal money string. */
  amount: string;
  /** The configured cash-advance ceiling, a decimal money string. */
  ceiling: string;
  labels?: Partial<CeilingCheckBadgeLabels>;
  className?: string;
}

/**
 * Cash-advance ceiling-check badge (M2 §3.4, design MD3) — ✓ while `amount` is within 50% of
 * `ceiling`, ⚠ once it crosses that (including over the ceiling entirely, where the request
 * would otherwise 422). Never color-alone: an icon + label carry the meaning, the tone reinforces it.
 */
export function CeilingCheckBadge({ amount, ceiling, labels: labelsProp, className }: CeilingCheckBadgeProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const ceilingDecimal = toDecimal(ceiling);
  const ratio = ceilingDecimal.isZero() ? toDecimal(0) : toDecimal(amount).dividedBy(ceilingDecimal);

  const within = ratio.lessThanOrEqualTo(0.5);
  const over = ratio.greaterThan(1);
  const tone = within ? "success" : over ? "danger" : "warning";
  const label = within ? labels.within : over ? labels.over : labels.approaching;

  return (
    <Badge tone={tone} className={cn("gap-1", className)}>
      <Icon icon={within ? CheckCircle2 : AlertTriangle} size={14} />
      {label}
    </Badge>
  );
}
