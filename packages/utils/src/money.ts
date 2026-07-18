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

/**
 * Back out the VAT-exclusive subtotal from a VAT-**inclusive** grand total (spec §5.5,
 * "Vat Nai"): `subtotal = grand / (1 + rate)`, at money scale, half-up. E.g. a ฿107 grand at
 * 7% yields `100.0000` (so `vat = grand − subtotal = 7.0000`). `rate` is a fraction (0.07 for
 * 7%). Throws if `1 + rate` is zero (a −100% rate).
 */
export function vatBackOut(grand: DecimalInput, rate: DecimalInput): string {
  const divisor = toDecimal(1).plus(toDecimal(rate));
  if (divisor.isZero()) throw new Error("Invalid VAT rate: 1 + rate is zero");
  return formatMoney(toDecimal(grand).dividedBy(divisor));
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

/**
 * Group the integer part of a fixed-scale decimal string in threes with commas (e.g. `"53500.00"`
 * → `"53,500.00"`). Pure string manipulation — no float conversion — so it's safe to use on
 * arbitrary-precision money/qty strings. Thai and English share the same Arabic-digit, comma-grouped
 * convention, so this is locale-invariant (spec §7.5: digits are always Arabic in both locales).
 */
export function groupDigits(value: string): string {
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const dot = abs.indexOf(".");
  const intPart = dot === -1 ? abs : abs.slice(0, dot);
  const fracPart = dot === -1 ? "" : abs.slice(dot);
  const grouped = `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fracPart}`;
  return negative ? `-${grouped}` : grouped;
}

/** True if the string is a valid decimal with at most `scale` fractional digits. */
export function isValidScaled(value: string, scale: number): boolean {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
  const dot = value.indexOf(".");
  const fractional = dot === -1 ? 0 : value.length - dot - 1;
  return fractional <= scale;
}
