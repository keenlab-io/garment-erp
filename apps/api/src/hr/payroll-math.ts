import { divideMoney, formatMoney, formatQty, sumMoney, toDecimal } from "@erp/utils";

/**
 * Pure payroll arithmetic (design D3/D4/D11, spec §2). Every value is a decimal **string**
 * at money (4dp) or qty (6dp) scale — never a float — and all rounding is half-up at the
 * cent via the `@erp/utils` helpers. Kept free of Nest/DB so the acceptance math is unit
 * tested to the cent (task 5.1/5.2). Parameters (tax bands, SSO, OT multipliers, hours
 * basis) are **non-authoritative** — resolved from effective-dated config and snapshotted
 * into `payslip.breakdown`.
 */

// Standard hours basis for the OT hourly rate (design D11, open question OQ4). Company
// standard assumed 26 working days × 8h/day; DAILY wages divide by the daily basis.
export const STANDARD_MONTHLY_HOURS = 26 * 8; // 208
export const STANDARD_DAILY_HOURS = 8;

export type EmploymentBasis = "MONTHLY" | "DAILY";

/**
 * Hourly rate from an employee's current base pay. MONTHLY salaries divide by the standard
 * monthly hours; DAILY wages (the `base` is the daily rate) divide by the daily hours.
 */
export function hourlyRate(base: string, employmentType: EmploymentBasis): string {
  const hours =
    employmentType === "MONTHLY" ? STANDARD_MONTHLY_HOURS : STANDARD_DAILY_HOURS;
  return divideMoney(base, String(hours));
}

/** OT pay = approved_hours × hourly_rate × rate_multiplier, at money scale. */
export function otPay(
  approvedHours: string,
  hourly: string,
  multiplier: string,
): string {
  return formatMoney(
    toDecimal(approvedHours).times(toDecimal(hourly)).times(toDecimal(multiplier)),
  );
}

/** Whole hours between two `HH:mm[:ss]` clock strings, as a qty string (crosses midnight-safe: same day only). */
export function hoursBetween(start: string, end: string): string {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  const minutes = Math.max(0, endMin - startMin);
  return formatQty(toDecimal(String(minutes)).dividedBy(60));
}

function toMinutes(clock: string): number {
  const [h = "0", m = "0"] = clock.split(":");
  return Number(h) * 60 + Number(m);
}

/** approved_hours = min(requested, attended); an explicit override wins when provided. */
export function approvedHours(
  requested: string,
  attended: string,
  override?: string,
): string {
  if (override !== undefined) return formatQty(override);
  const lower = toDecimal(requested).lessThanOrEqualTo(toDecimal(attended))
    ? requested
    : attended;
  return formatQty(lower);
}

// ── Statutory (non-authoritative) ──────────────────────────────────────────────

/** One progressive tax band: income in `[lowerBound, upperBound)` is taxed at `rate`. */
export interface TaxBracket {
  lowerBound: string;
  upperBound: string | null; // null = open-ended top band
  rate: string; // fraction, e.g. "0.05"
}

/** Progressive tax on an **annual** income across the (sorted) bands, at money scale. */
export function annualTax(annualIncome: string, brackets: TaxBracket[]): string {
  const income = toDecimal(annualIncome);
  let tax = toDecimal("0");
  for (const band of brackets) {
    const lower = toDecimal(band.lowerBound);
    if (income.lessThanOrEqualTo(lower)) break;
    const upper = band.upperBound === null ? income : toDecimal(band.upperBound);
    const cap = income.lessThanOrEqualTo(upper) ? income : upper; // min(income, upper)
    const taxable = cap.minus(lower);
    if (taxable.greaterThan(0)) tax = tax.plus(taxable.times(toDecimal(band.rate)));
  }
  return formatMoney(tax);
}

/**
 * Monthly withholding for a monthly taxable income: annualize (×12), apply the progressive
 * schedule, and spread back over 12 months. Half-up at the cent.
 */
export function monthlyTax(monthlyTaxable: string, brackets: TaxBracket[]): string {
  const annual = formatMoney(toDecimal(monthlyTaxable).times(12));
  return divideMoney(annualTax(annual, brackets), "12");
}

/** SSO contribution: rate × wage clamped to `[floor, ceiling]`, at money scale. */
export function ssoContribution(
  monthlyWage: string,
  config: { rate: string; wageFloor: string; wageCeiling: string },
): string {
  // Clamp to [floor, ceiling] = min(ceiling, max(floor, wage)).
  const floor = toDecimal(config.wageFloor);
  const ceiling = toDecimal(config.wageCeiling);
  const raw = toDecimal(monthlyWage);
  const atLeastFloor = raw.lessThanOrEqualTo(floor) ? floor : raw;
  const wage = atLeastFloor.lessThanOrEqualTo(ceiling) ? atLeastFloor : ceiling;
  return formatMoney(wage.times(toDecimal(config.rate)));
}

// ── Net formula ────────────────────────────────────────────────────────────────

/** One named line in a payslip breakdown (allowance or deduction). */
export interface PayLine {
  name: string;
  amount: string;
}

/** The immutable inputs snapshotted into `payslip.breakdown`. */
export interface PayslipBreakdown {
  base: string;
  ot: string;
  allowances: PayLine[];
  sso: string;
  tax: string;
  advance: string;
  deductions: PayLine[]; // other deductions (non-statutory, non-advance)
}

/**
 * Canonical net formula (spec §2, plan §3):
 *   net = (base + Σallowances + ot) − (sso + tax + advance + Σother_deductions)
 * Returns the resolved `gross`/`total_deductions`/`net`, all half-up at the cent.
 */
export function computeTotals(breakdown: PayslipBreakdown): {
  gross: string;
  totalDeductions: string;
  net: string;
} {
  const gross = sumMoney([
    breakdown.base,
    breakdown.ot,
    ...breakdown.allowances.map((a) => a.amount),
  ]);
  const totalDeductions = sumMoney([
    breakdown.sso,
    breakdown.tax,
    breakdown.advance,
    ...breakdown.deductions.map((d) => d.amount),
  ]);
  const net = formatMoney(toDecimal(gross).minus(toDecimal(totalDeductions)));
  return { gross, totalDeductions, net };
}

// ── Cash advance ────────────────────────────────────────────────────────────────

/** The ceiling for a cash advance = ceiling_pct × current base salary, at money scale. */
export function advanceCeiling(baseSalary: string, ceilingPct: string): string {
  return formatMoney(toDecimal(baseSalary).times(toDecimal(ceilingPct)));
}

/**
 * The amount to pull for one payroll period from an outstanding advance. LUMP repays the
 * whole outstanding balance; INSTALLMENT repays `outstanding / remaining installments`,
 * capped at the outstanding (so the final period clears it exactly).
 */
export function advanceRepayment(
  outstanding: string,
  plan: { mode: "LUMP" | "INSTALLMENT"; installments?: number } | null,
): string {
  if (plan?.mode === "INSTALLMENT" && plan.installments && plan.installments > 0) {
    const perPeriod = divideMoney(outstanding, String(plan.installments));
    // Never pull more than what remains.
    return toDecimal(perPeriod).greaterThan(toDecimal(outstanding))
      ? formatMoney(outstanding)
      : perPeriod;
  }
  return formatMoney(outstanding); // LUMP (or unspecified) → clear it
}
