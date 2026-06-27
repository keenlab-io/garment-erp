import { Decimal } from "decimal.js";

/**
 * Money / quantity helpers.
 *
 * Spec §5.3 / §13: amounts and quantities cross the wire as **strings** to avoid
 * float precision loss. Convert to a Decimal for arithmetic, then format back to a
 * fixed-scale string before persisting or sending.
 *
 *  - Money    → NUMERIC(18,4)  → 4 decimal places
 *  - Quantity → NUMERIC(18,6)  → 6 decimal places
 */

export const MONEY_SCALE = 4;
export const QTY_SCALE = 6;

export type DecimalInput = string | number | Decimal;

/** Parse a wire value into a Decimal, throwing on non-finite input. */
export function toDecimal(value: DecimalInput): Decimal {
  const d = new Decimal(value);
  if (!d.isFinite()) {
    throw new Error(`Invalid decimal value: ${String(value)}`);
  }
  return d;
}

/** Format a value as a fixed-scale string (rounds half-up). */
export function format(value: DecimalInput, scale: number): string {
  return toDecimal(value).toFixed(scale, Decimal.ROUND_HALF_UP);
}

/** Format as money — NUMERIC(18,4). */
export function formatMoney(value: DecimalInput): string {
  return format(value, MONEY_SCALE);
}

/** Format as quantity — NUMERIC(18,6). */
export function formatQty(value: DecimalInput): string {
  return format(value, QTY_SCALE);
}

/** lineTotal = qty * unitPrice, returned as a money-scale string. */
export function lineTotal(qty: DecimalInput, unitPrice: DecimalInput): string {
  return formatMoney(toDecimal(qty).times(toDecimal(unitPrice)));
}

/** Sum a list of money strings, returned as a money-scale string. */
export function sumMoney(values: DecimalInput[]): string {
  return formatMoney(
    values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0)),
  );
}

/** True if the string is a valid decimal with at most `scale` fractional digits. */
export function isValidScaled(value: string, scale: number): boolean {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
  const dot = value.indexOf(".");
  const fractional = dot === -1 ? 0 : value.length - dot - 1;
  return fractional <= scale;
}
