import { asMoney, type Money, type SubscriptionInvoiceLine } from "@erp/contracts";
import { format, formatMoney, sumMoney, toDecimal } from "@erp/utils";
import { BusinessRuleError } from "../../common/errors/app-exception.js";

/**
 * Pure M9 billing arithmetic (design D1/D2/D7) — no I/O, so the term and money rules are unit-
 * tested in isolation. Money is always a string in and out, computed with `@erp/utils` decimals.
 */

/** A subscription invoice's billed period, `[start, end)`. */
export interface BillingPeriod {
  start: Date;
  end: Date;
}

/** `date` moved `years` calendar years forward, in UTC (29 Feb lands on 1 Mar in common years). */
export function addYears(date: Date, years: number): Date {
  const out = new Date(date.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}

/**
 * The period a new invoice bills (design D1). A subscription's first invoice pays for the term it
 * was created with (`term_start → term_end`); every later invoice is a renewal that bills the
 * year starting at the current `term_end` — never at the issue or payment date.
 */
export function invoicePeriod(
  sub: { termStart: Date; termEnd: Date },
  isFirstInvoice: boolean,
): BillingPeriod {
  if (isFirstInvoice) return { start: sub.termStart, end: sub.termEnd };
  return { start: sub.termEnd, end: addYears(sub.termEnd, 1) };
}

/**
 * The `term_end` after an invoice for `period` is paid (design D1, subscription-lifecycle spec).
 * A renewal period starts at the previous `term_end`, so the term extends from there — a late
 * payment does not shorten the next term, and paying a period the term already covers (the first
 * invoice, or a second invoice for the same renewal) does not extend it twice.
 */
export function extendedTermEnd(previousTermEnd: Date, period: BillingPeriod | null): Date {
  if (!period || period.end.getTime() <= previousTermEnd.getTime()) return previousTermEnd;
  return period.end;
}

/**
 * Default pay-up-front discount — "worth about two months" (GTM Part 3, design D7):
 * `annual_fee × 2/12`, rounded half-up to the satang.
 */
export function defaultUpfrontDiscount(annualFee: string): string {
  return formatMoney(format(toDecimal(annualFee).times(2).dividedBy(12), 2));
}

export interface InvoiceLineInput {
  annualFee: string;
  /** Only honoured on a subscription's first invoice (design D7). */
  setupFee?: string;
  extraSeats?: { seats: number; amount: string };
  /** Magnitude (non-negative); `undefined` → the default two-month discount, `"0"` → no line. */
  upfrontDiscount?: string;
  isFirstInvoice: boolean;
}

/**
 * The typed lines of a subscription invoice (design D2/D7): `ANNUAL_FEE` always; `SETUP_FEE` only
 * on the first invoice; `EXTRA_SEATS` when bought; and `UPFRONT_DISCOUNT` as its own NEGATIVE line
 * so the customer's paperwork shows list price and discount separately. 422 when an amount is
 * negative or the discount exceeds the annual fee.
 */
export function buildInvoiceLines(input: InvoiceLineInput): SubscriptionInvoiceLine[] {
  const annual = nonNegative(input.annualFee, "annual_fee");
  const lines: SubscriptionInvoiceLine[] = [
    { kind: "ANNUAL_FEE", description: "Annual subscription fee", amount: money(annual) },
  ];

  if (input.isFirstInvoice && input.setupFee !== undefined) {
    const setup = nonNegative(input.setupFee, "setup_fee");
    if (!setup.isZero()) {
      lines.push({ kind: "SETUP_FEE", description: "One-time setup fee", amount: money(setup) });
    }
  }

  if (input.extraSeats) {
    const seats = nonNegative(input.extraSeats.amount, "extra_seats.amount");
    lines.push({
      kind: "EXTRA_SEATS",
      description: `Additional seats × ${input.extraSeats.seats}`,
      amount: money(seats),
    });
  }

  const discount = nonNegative(
    input.upfrontDiscount ?? defaultUpfrontDiscount(input.annualFee),
    "upfront_discount",
  );
  if (discount.greaterThan(annual)) {
    throw new BusinessRuleError("The up-front discount cannot exceed the annual fee", [
      { field: "upfront_discount", issue: `must be at most ${formatMoney(annual)}` },
    ]);
  }
  if (!discount.isZero()) {
    lines.push({
      kind: "UPFRONT_DISCOUNT",
      description: "Discount for paying the year up front",
      amount: money(discount.negated()),
    });
  }
  return lines;
}

/** VAT-exclusive totals of an invoice's lines. Subscription invoices carry no VAT line. */
export function invoiceTotals(lines: readonly SubscriptionInvoiceLine[]): {
  subtotal: Money;
  vatAmount: Money;
  total: Money;
} {
  const subtotal = asMoney(sumMoney(lines.map((l) => l.amount)));
  return { subtotal, vatAmount: money(0), total: subtotal };
}

/**
 * Mark-paid amount guard (design Risks — "a typo does not extend a term"): a paid amount that
 * differs from the invoice total is a 422 unless the matching override flag is set explicitly.
 */
export function assertPaidAmount(
  total: string,
  amount: string,
  flags: { accept_partial?: boolean; accept_over?: boolean },
): void {
  const cmp = toDecimal(amount).comparedTo(toDecimal(total));
  if (cmp < 0 && !flags.accept_partial) {
    throw new BusinessRuleError("Paid amount is less than the invoice total", [
      { field: "amount", issue: `expected ${formatMoney(total)}; set accept_partial to override` },
    ]);
  }
  if (cmp > 0 && !flags.accept_over) {
    throw new BusinessRuleError("Paid amount exceeds the invoice total", [
      { field: "amount", issue: `expected ${formatMoney(total)}; set accept_over to override` },
    ]);
  }
}

/** `SINV-{YYYY}-{seq}` (design D2), the sequence value zero-padded to four digits. */
export function formatInvoiceNumber(year: number, seq: number | bigint | string): string {
  return `SINV-${year}-${String(seq).padStart(4, "0")}`;
}

function nonNegative(value: string, field: string): ReturnType<typeof toDecimal> {
  const d = toDecimal(value);
  if (d.isNegative()) {
    throw new BusinessRuleError(`${field} must not be negative`, [
      { field, issue: "must be ≥ 0" },
    ]);
  }
  return d;
}

const money = (value: Parameters<typeof formatMoney>[0]): Money => asMoney(formatMoney(value));
