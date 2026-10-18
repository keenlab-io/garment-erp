/**
 * The Thai SME software double-deduction decree, as versioned DATA (M9 design D6 / Risks — "tax
 * rates change / decree amended"): the sunset date, the annual qualifying-spend cap, the SME
 * corporate-income-tax rate band the illustrated saving is shown over, and the accountant caveat.
 * An amendment is a new entry here, not a code change in the quote math — `QuoteService` never
 * holds a literal rate, cap, or date.
 */
export interface TaxBenefitConfig {
  /** Identifies the decree reading a quote was computed under. */
  version: string;
  /** First quote date (inclusive, `YYYY-MM-DD`) this version applies to. */
  effectiveFrom: string;
  /** Last quote date (inclusive, `YYYY-MM-DD`) on which the benefit may be shown at all. */
  sunset: string;
  /** Maximum qualifying spend per year, baht (money string). */
  annualCap: string;
  /** SME CIT rate band the saving is presented over, as decimal fractions. */
  citRateBand: { min: string; max: string };
  /** GTM Part 2, near-verbatim — embedded in every benefit-bearing output, never omittable. */
  caveat: string;
}

/** Every published reading of the decree, oldest first. */
export const TAX_BENEFIT_CONFIGS: readonly TaxBenefitConfig[] = [
  {
    version: "th-sme-software-double-deduction-2026-02",
    effectiveFrom: "2026-02-01",
    sunset: "2027-12-31",
    annualCap: "300000",
    citRateBand: { min: "0.15", max: "0.20" },
    caveat:
      "These figures are illustrative. Every business's tax position is different, and the " +
      "customer's accountant must confirm the actual saving and the business's eligibility " +
      "before relying on them. This quote is not tax advice.",
  },
];

/**
 * The config version governing a quote dated `quoteDate` (`YYYY-MM-DD`): the latest entry already
 * effective on that date, or — for a date before any entry — the earliest one (whose sunset still
 * bounds it). The benefit's own sunset check is the caller's job.
 */
export function taxBenefitConfigFor(
  quoteDate: string,
  configs: readonly TaxBenefitConfig[] = TAX_BENEFIT_CONFIGS,
): TaxBenefitConfig {
  const first = configs[0];
  if (!first) throw new Error("No tax-benefit config versions are defined");
  let current = first;
  for (const c of configs) if (c.effectiveFrom <= quoteDate) current = c;
  return current;
}
