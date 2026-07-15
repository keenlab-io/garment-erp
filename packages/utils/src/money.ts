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

/** Divide `a / b` at money scale (rounds half-up). Throws on divide-by-zero. */
export function divideMoney(a: DecimalInput, b: DecimalInput): string {
  const divisor = toDecimal(b);
  if (divisor.isZero()) throw new Error("Division by zero");
  return formatMoney(toDecimal(a).dividedBy(divisor));
}

/** Divide `a / b` at quantity scale (rounds half-up). Throws on divide-by-zero. */
export function divideQty(a: DecimalInput, b: DecimalInput): string {
  const divisor = toDecimal(b);
  if (divisor.isZero()) throw new Error("Division by zero");
  return formatQty(toDecimal(a).dividedBy(divisor));
}

/**
 * Moving-average unit cost after an IN posting (spec §3.4):
 *   `new_avg = (qtyOnHand·avgCost + inQty·inCost) / (qtyOnHand + inQty)`
 * Returned at money scale. When the resulting on-hand is zero there is no meaningful
 * average, so the incoming unit cost is returned unchanged.
 */
export function movingAverage(
  qtyOnHand: DecimalInput,
  avgCost: DecimalInput,
  inQty: DecimalInput,
  inCost: DecimalInput,
): string {
  const onHand = toDecimal(qtyOnHand);
  const incoming = toDecimal(inQty);
  const total = onHand.plus(incoming);
  if (total.isZero()) return formatMoney(inCost);
  const value = onHand
    .times(toDecimal(avgCost))
    .plus(incoming.times(toDecimal(inCost)));
  return formatMoney(value.dividedBy(total));
}

/**
 * Proportionally split `total` across `weights`, returned as money-scale strings that
 * sum **exactly** to `formatMoney(total)`. Each part is `total·weight/Σweights` rounded
 * half-up; the rounding remainder (`total − Σparts`) is assigned to the largest-weight
 * part so the parts always reconcile to the total. When every weight is zero (or the
 * list is a single element) the split is even by count, remainder to the first part.
 */
export function allocate(total: DecimalInput, weights: DecimalInput[]): string[] {
  const n = weights.length;
  if (n === 0) return [];

  const totalDec = toDecimal(total);
  const weightDecs = weights.map((w) => toDecimal(w));
  const weightSum = weightDecs.reduce((acc, w) => acc.plus(w), new Decimal(0));

  const parts = weightSum.isZero()
    ? weightDecs.map(() => totalDec.dividedBy(n))
    : weightDecs.map((w) => totalDec.times(w).dividedBy(weightSum));

  const rounded = parts.map((p) => new Decimal(formatMoney(p)));
  const roundedSum = rounded.reduce((acc, p) => acc.plus(p), new Decimal(0));
  const remainder = new Decimal(formatMoney(totalDec)).minus(roundedSum);

  if (!remainder.isZero()) {
    let target = 0;
    for (let i = 1; i < n; i++) {
      const wi = weightDecs[i];
      const wt = weightDecs[target];
      if (wi && wt && wi.greaterThan(wt)) target = i;
    }
    const current = rounded[target];
    if (current) rounded[target] = current.plus(remainder);
  }

  return rounded.map((r) => formatMoney(r));
}

/** True if the string is a valid decimal with at most `scale` fractional digits. */
export function isValidScaled(value: string, scale: number): boolean {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
  const dot = value.indexOf(".");
  const fractional = dot === -1 ? 0 : value.length - dot - 1;
  return fractional <= scale;
}
