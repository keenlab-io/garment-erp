import { describe, expect, it } from "vitest";
import {
  advanceCeiling,
  advanceRepayment,
  annualTax,
  approvedHours,
  computeTotals,
  hourlyRate,
  hoursBetween,
  monthlyTax,
  otPay,
  ssoContribution,
  STANDARD_MONTHLY_HOURS,
  type TaxBracket,
} from "./payroll-math.js";

// Payroll math correct to the cent (issue "Done when"; tasks 5.1/5.2). All values are
// decimal strings; rounding is half-up at money (4dp) / qty (6dp) scale.

// The seeded dev config (packages/db/src/seed/seed.ts): progressive annual bands, SSO 5%
// clamped to [1650, 15000], OT multipliers, advance ceiling 50%.
const TAX_BRACKETS: TaxBracket[] = [
  { lowerBound: "0", upperBound: "150000", rate: "0" },
  { lowerBound: "150000", upperBound: "300000", rate: "0.05" },
  { lowerBound: "300000", upperBound: "500000", rate: "0.1" },
  { lowerBound: "500000", upperBound: "750000", rate: "0.15" },
  { lowerBound: "750000", upperBound: "1000000", rate: "0.2" },
  { lowerBound: "1000000", upperBound: null, rate: "0.25" },
];

describe("hourlyRate", () => {
  it("divides a monthly salary by the standard monthly hours", () => {
    // 41600 / 208 = 200.0000
    expect(hourlyRate("41600", "MONTHLY")).toBe("200.0000");
    expect(STANDARD_MONTHLY_HOURS).toBe(208);
  });

  it("divides a daily wage by the standard daily hours", () => {
    expect(hourlyRate("800", "DAILY")).toBe("100.0000"); // 800 / 8
  });
});

describe("hoursBetween / approvedHours", () => {
  it("computes whole/fractional hours between two clocks", () => {
    expect(hoursBetween("18:00", "21:00")).toBe("3.000000");
    expect(hoursBetween("18:00", "20:30")).toBe("2.500000");
    expect(hoursBetween("21:00", "18:00")).toBe("0.000000"); // guard against negative
  });

  it("clamps approved hours to min(requested, attended)", () => {
    // requested 3h, attended 2h ⇒ 2h (task 5.1)
    expect(approvedHours("3", "2")).toBe("2.000000");
    expect(approvedHours("2", "3")).toBe("2.000000");
  });

  it("honours an explicit override", () => {
    expect(approvedHours("3", "2", "1.5")).toBe("1.500000");
  });
});

describe("otPay", () => {
  it("multiplies approved hours × hourly rate × multiplier", () => {
    // 2h × 200/h × 1.5 = 600
    expect(otPay("2", "200", "1.5")).toBe("600.0000");
  });
});

describe("annualTax / monthlyTax", () => {
  it("applies the progressive schedule to an annual income", () => {
    // 400k: 150k@0 + 150k@5% (7500) + 100k@10% (10000) = 17500
    expect(annualTax("400000", TAX_BRACKETS)).toBe("17500.0000");
  });

  it("is zero below the first taxable band", () => {
    expect(annualTax("120000", TAX_BRACKETS)).toBe("0.0000");
  });

  it("spreads the annualized tax over 12 months", () => {
    // 30000/mo → 360k/yr → 150k@0 + 150k@5% (7500) + 60k@10% (6000) = 13500 → /12 = 1125
    expect(monthlyTax("30000", TAX_BRACKETS)).toBe("1125.0000");
  });
});

describe("ssoContribution", () => {
  const cfg = { rate: "0.05", wageFloor: "1650", wageCeiling: "15000" };
  it("is 5% of the wage within the band", () => {
    expect(ssoContribution("10000", cfg)).toBe("500.0000");
  });
  it("clamps to the ceiling", () => {
    expect(ssoContribution("50000", cfg)).toBe("750.0000"); // 15000 × 5%
  });
  it("clamps to the floor", () => {
    expect(ssoContribution("1000", cfg)).toBe("82.5000"); // 1650 × 5%
  });
});

describe("computeTotals (net formula)", () => {
  it("nets gross minus all deductions to the cent", () => {
    const totals = computeTotals({
      base: "30000",
      ot: "600",
      allowances: [{ name: "Housing", amount: "2000" }],
      sso: "750",
      tax: "1125",
      advance: "1000",
      deductions: [{ name: "Uniform", amount: "150" }],
    });
    // gross = 30000 + 600 + 2000 = 32600
    expect(totals.gross).toBe("32600.0000");
    // deductions = 750 + 1125 + 1000 + 150 = 3025
    expect(totals.totalDeductions).toBe("3025.0000");
    expect(totals.net).toBe("29575.0000");
  });

  it("adding an advance reduces net by exactly the advance", () => {
    const withoutAdvance = computeTotals({
      base: "20000",
      ot: "0",
      allowances: [],
      sso: "750",
      tax: "0",
      advance: "0",
      deductions: [],
    });
    const withAdvance = computeTotals({
      base: "20000",
      ot: "0",
      allowances: [],
      sso: "750",
      tax: "0",
      advance: "2500",
      deductions: [],
    });
    expect(withoutAdvance.net).toBe("19250.0000");
    expect(withAdvance.net).toBe("16750.0000"); // exactly 2500 less
  });
});

describe("cash advance", () => {
  it("ceiling is ceiling_pct × base salary", () => {
    expect(advanceCeiling("30000", "0.5")).toBe("15000.0000");
  });

  it("LUMP repayment clears the whole outstanding balance", () => {
    expect(advanceRepayment("5000", { mode: "LUMP" })).toBe("5000.0000");
  });

  it("INSTALLMENT repayment splits the outstanding across installments", () => {
    expect(advanceRepayment("6000", { mode: "INSTALLMENT", installments: 3 })).toBe(
      "2000.0000",
    );
  });

  it("INSTALLMENT never pulls more than what remains", () => {
    expect(advanceRepayment("1000", { mode: "INSTALLMENT", installments: 3 })).toBe(
      "333.3333",
    );
  });
});
