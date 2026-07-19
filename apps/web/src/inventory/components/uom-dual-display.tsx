import * as React from "react";
import { QtyCell, cn } from "@erp/ui";

export interface UomDualDisplayProps {
  /** Quantity in the receiving/from UOM, e.g. "1" roll. */
  qty: string;
  uomLabel: string;
  /** The same quantity converted to the item's base UOM, e.g. "50" m. */
  baseQty: string;
  baseUomLabel: string;
  className?: string;
}

/**
 * Shows a UOM conversion both ways instead of silently converting (M3 §3.5, design MD3): "1 roll =
 * 50 m". Used on goods-receipt lines received in a non-base unit.
 */
export function UomDualDisplay({ qty, uomLabel, baseQty, baseUomLabel, className }: UomDualDisplayProps) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 text-sm", className)}>
      <QtyCell value={qty} unit={uomLabel} className="inline-block w-auto text-left text-text-primary" />
      <span aria-hidden className="text-text-muted">
        =
      </span>
      <QtyCell value={baseQty} unit={baseUomLabel} className="inline-block w-auto text-left text-text-secondary" />
    </span>
  );
}
