import * as React from "react";
import { toDecimal, type DecimalInput } from "@erp/utils";
import { InkChip, type ChipStatus } from "@erp/ui";

export type StockHealthStatus = Extract<ChipStatus, "stock-ok" | "stock-near-min" | "stock-dead">;

/**
 * Resolves an item's stock health: `dead` (no movement within the dead-stock report's window) wins,
 * then on-hand at/below `minStock` is near-minimum, otherwise ok. `minStock` is nullable — an item
 * with no configured minimum is never flagged near-minimum.
 */
export function resolveStockHealth(
  onHand: DecimalInput,
  minStock?: DecimalInput | null,
  dead = false,
): StockHealthStatus {
  if (dead) return "stock-dead";
  if (minStock != null && toDecimal(onHand).lessThanOrEqualTo(toDecimal(minStock))) return "stock-near-min";
  return "stock-ok";
}

export interface StockHealthChipProps {
  onHand: string;
  minStock?: string | null;
  /** Force the dead-stock state (from the dead-stock report's window check). */
  dead?: boolean;
  label?: string;
  className?: string;
}

/** The stock-health Ink-Chip (M3 §3.5, design MD5) — items list low-stock signal + reports. */
export function StockHealthChip({ onHand, minStock, dead = false, label, className }: StockHealthChipProps) {
  return <InkChip status={resolveStockHealth(onHand, minStock, dead)} label={label} className={className} />;
}
