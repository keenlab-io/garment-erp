import {
  asMoney,
  type Money,
  type QuoteComputeRequest,
  type QuoteEligibility,
  type QuoteResult,
  type QuoteTaxBenefit,
} from "@erp/contracts";
import { formatMoney, toDecimal, type DecimalInput } from "@erp/utils";
import { buildInvoiceLines, invoiceTotals } from "./billing-math.js";
import { taxBenefitConfigFor, type TaxBenefitConfig } from "./tax-benefit-config.js";

/**
 * Pure M9 tax-benefit quoting (§5.1, design D6, tax-benefit-quoting spec) — no I/O. The quote's
 * lines are exactly the first invoice's (`buildInvoiceLines`, so quote ↔ invoice reconcile), and
 * the after-benefit section exists only when every gate holds. Money is strings in and out.
 */
export interface QuoteContext {
  /** Today, `YYYY-MM-DD`; the quote date when the request carries none. */
  today: string;
  /** The vendor's depa Thailand Digital Catalog registration flag. */
  catalogRegistered: boolean;
  /** Defaults to the version effective on the quote date. */
  config?: TaxBenefitConfig;
}

/**
 * The benefit gate (spec "shown only on declared eligibility — never blindly"): BOTH declarations
 * true, quote date on/before the decree's sunset, and the depa catalog flag on. An absent
 * eligibility block is undeclared, i.e. ineligible.
 */
export function benefitApplies(
  eligibility: QuoteEligibility | undefined,
  quoteDate: string,
  catalogRegistered: boolean,
  config: TaxBenefitConfig,
): boolean {
  return (
    catalogRegistered &&
    quoteDate <= config.sunset &&
    eligibility?.registered_capital_at_most_5m === true &&
    eligibility.annual_revenue_at_most_30m === true
  );
}

/**
 * The illustration on a first-year total (spec "respects the ฿300,000 annual cap"): qualifying
 * spend `min(total, cap)`, extra deduction = qualifying spend (the second counting of the same
 * baht), saving = extra deduction × the CIT band, effective price = total − saving (so the band's
 * high end gives the low effective price). Spend above the cap is reported as non-qualifying.
 */
export function taxBenefit(firstYearTotal: string, config: TaxBenefitConfig): QuoteTaxBenefit {
  const total = toDecimal(firstYearTotal);
  const cap = toDecimal(config.annualCap);
  const qualifying = total.isNegative() ? toDecimal(0) : total.greaterThan(cap) ? cap : total;
  const nonQualifying = total.minus(qualifying);
  const savingMin = qualifying.times(config.citRateBand.min);
  const savingMax = qualifying.times(config.citRateBand.max);
  return {
    qualifying_spend: money(qualifying),
    non_qualifying_spend: money(nonQualifying.isNegative() ? 0 : nonQualifying),
    extra_deduction: money(qualifying),
    estimated_saving: { min: money(savingMin), max: money(savingMax) },
    effective_price: { min: money(total.minus(savingMax)), max: money(total.minus(savingMin)) },
    caveat: config.caveat,
  };
}

/** Compute a stateless quote (design open question 4 — no persistence, no number). */
export function computeQuote(input: QuoteComputeRequest, ctx: QuoteContext): QuoteResult {
  const quoteDate = input.quote_date ?? ctx.today;
  const config = ctx.config ?? taxBenefitConfigFor(quoteDate);
  const lines = buildInvoiceLines({
    annualFee: input.fees.annual_fee,
    setupFee: input.fees.setup_fee,
    upfrontDiscount: input.fees.upfront_discount,
    isFirstInvoice: true,
  });
  const { total } = invoiceTotals(lines);

  const result: QuoteResult = {
    plan: input.plan,
    term: input.term,
    quote_date: quoteDate,
    lines,
    first_year_total: total,
    eligibility: input.eligibility ?? null,
  };
  // Absent entirely — not zeroed — when any gate fails.
  if (benefitApplies(input.eligibility, quoteDate, ctx.catalogRegistered, config)) {
    result.tax_benefit = taxBenefit(total, config);
  }
  return result;
}

/** `YYYY-MM-DD` of `now` in Thailand (UTC+7, no DST) — the decree's sunset is a Thai date. */
export function bangkokDate(now: Date): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const money = (value: DecimalInput): Money => asMoney(formatMoney(value));
