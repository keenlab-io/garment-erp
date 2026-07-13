import * as React from "react";
import { format, type DecimalInput } from "@erp/utils";
import { cn } from "../../lib/cn.js";

/** Group the integer digits in threes with commas — pure string work, never a float. */
function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Round to `scale` via decimal.js (no float) then group the integer part. Returns the grouped
 * magnitude plus whether the value is negative — the caller decides how to weight negatives.
 */
function formatGrouped(value: DecimalInput, scale: number): { magnitude: string; negative: boolean } {
  const raw = format(value, scale);
  const negative = raw.startsWith("-");
  const abs = negative ? raw.slice(1) : raw;
  const dot = abs.indexOf(".");
  const intPart = dot === -1 ? abs : abs.slice(0, dot);
  const fracPart = dot === -1 ? "" : abs.slice(dot);
  return { magnitude: `${groupThousands(intPart)}${fracPart}`, negative };
}

interface NumericCellBaseProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The value as a decimal string (contract `Money`/`Qty`), number, or Decimal — never a float wire value. */
  value: DecimalInput;
  /** Fractional digits to display (rounded half-up via decimal.js). */
  scale?: number;
}

function NumericCell({
  value,
  scale,
  prefix,
  suffix,
  className,
  ...props
}: NumericCellBaseProps & { prefix?: string; suffix?: string; scale: number }) {
  const { magnitude, negative } = formatGrouped(value, scale);
  const body = `${prefix ?? ""}${magnitude}${suffix ?? ""}`;
  return (
    <span
      className={cn(
        "block text-right font-numeric tabular-nums",
        negative && "text-danger",
        className,
      )}
      {...props}
    >
      {negative ? `(${body})` : body}
    </span>
  );
}

export interface MoneyCellProps extends NumericCellBaseProps {
  /** Currency symbol rendered adjacent to the amount. Pass "" to omit. */
  currency?: string;
}

/**
 * A money amount: right-aligned, tabular, currency-adjacent, formatted from a decimal string with no
 * float in the path. Negatives are weighted in danger and wrapped in accounting parentheses.
 */
export function MoneyCell({ currency = "฿", scale = 2, ...props }: MoneyCellProps) {
  return <NumericCell prefix={currency} scale={scale} {...props} />;
}

export interface QtyCellProps extends NumericCellBaseProps {
  /** Unit label rendered adjacent to the quantity, e.g. "ml", "pcs". */
  unit?: string;
}

/** A quantity: right-aligned, tabular, unit-adjacent, formatted from a decimal string (no float). */
export function QtyCell({ unit, scale = 2, ...props }: QtyCellProps) {
  return <NumericCell suffix={unit ? ` ${unit}` : undefined} scale={scale} {...props} />;
}
