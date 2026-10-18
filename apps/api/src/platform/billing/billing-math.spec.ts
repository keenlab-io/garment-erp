import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "../../common/errors/app-exception.js";
import {
  addYears,
  assertPaidAmount,
  buildInvoiceLines,
  defaultUpfrontDiscount,
  extendedTermEnd,
  formatInvoiceNumber,
  invoicePeriod,
  invoiceTotals,
} from "./billing-math.js";

// M9 §3.1/3.2 (design D1/D2/D7) — term-extension math and invoice-line money rules.

const d = (iso: string): Date => new Date(iso);

describe("term math (design D1)", () => {
  it("adds calendar years in UTC", () => {
    expect(addYears(d("2027-03-31T00:00:00Z"), 1).toISOString()).toBe("2028-03-31T00:00:00.000Z");
  });

  it("bills the created term on the first invoice and the next year on a renewal", () => {
    const sub = { termStart: d("2026-04-01T00:00:00Z"), termEnd: d("2027-03-31T00:00:00Z") };
    expect(invoicePeriod(sub, true)).toEqual({ start: sub.termStart, end: sub.termEnd });
    expect(invoicePeriod(sub, false)).toEqual({
      start: sub.termEnd,
      end: d("2028-03-31T00:00:00Z"),
    });
  });

  it("extends a late renewal from the previous term_end, not the payment date", () => {
    // Expired 2027-03-31, paid 2027-04-10 → new term_end 2028-03-31 (spec scenario).
    const prev = d("2027-03-31T00:00:00Z");
    const period = invoicePeriod({ termStart: d("2026-03-31T00:00:00Z"), termEnd: prev }, false);
    expect(extendedTermEnd(prev, period).toISOString()).toBe("2028-03-31T00:00:00.000Z");
  });

  it("does not extend for a period the term already covers (first invoice, double payment)", () => {
    const prev = d("2027-03-31T00:00:00Z");
    expect(extendedTermEnd(prev, { start: d("2026-03-31T00:00:00Z"), end: prev })).toBe(prev);
    const renewed = d("2028-03-31T00:00:00Z");
    expect(extendedTermEnd(renewed, { start: prev, end: renewed })).toBe(renewed);
    expect(extendedTermEnd(prev, null)).toBe(prev);
  });
});

describe("invoice lines (design D7)", () => {
  it("defaults the up-front discount to annual_fee × 2/12, rounded to the satang", () => {
    expect(defaultUpfrontDiscount("150000")).toBe("25000.0000");
    expect(defaultUpfrontDiscount("100000.0000")).toBe("16666.6700");
  });

  it("builds the first-year Factory shape: annual + setup + negative discount", () => {
    const lines = buildInvoiceLines({
      annualFee: "150000.0000",
      setupFee: "100000",
      isFirstInvoice: true,
    });
    expect(lines.map((l) => [l.kind, l.amount])).toEqual([
      ["ANNUAL_FEE", "150000.0000"],
      ["SETUP_FEE", "100000.0000"],
      ["UPFRONT_DISCOUNT", "-25000.0000"],
    ]);
    expect(invoiceTotals(lines)).toEqual({
      subtotal: "225000.0000",
      vatAmount: "0.0000",
      total: "225000.0000",
    });
  });

  it("carries no SETUP_FEE on a renewal even when one is passed", () => {
    const lines = buildInvoiceLines({
      annualFee: "150000",
      setupFee: "100000",
      isFirstInvoice: false,
    });
    expect(lines.map((l) => l.kind)).toEqual(["ANNUAL_FEE", "UPFRONT_DISCOUNT"]);
  });

  it("honours an admin-edited discount, omits a zero one, and adds extra seats", () => {
    const lines = buildInvoiceLines({
      annualFee: "48000",
      extraSeats: { seats: 5, amount: "6000" },
      upfrontDiscount: "0",
      isFirstInvoice: false,
    });
    expect(lines.map((l) => [l.kind, l.amount])).toEqual([
      ["ANNUAL_FEE", "48000.0000"],
      ["EXTRA_SEATS", "6000.0000"],
    ]);
    const edited = buildInvoiceLines({
      annualFee: "48000",
      upfrontDiscount: "5000",
      isFirstInvoice: false,
    });
    expect(edited.at(-1)).toMatchObject({ kind: "UPFRONT_DISCOUNT", amount: "-5000.0000" });
  });

  it("rejects a negative amount or a discount above the annual fee with 422", () => {
    expect(() =>
      buildInvoiceLines({ annualFee: "48000", upfrontDiscount: "-1", isFirstInvoice: false }),
    ).toThrow(BusinessRuleError);
    expect(() =>
      buildInvoiceLines({ annualFee: "48000", upfrontDiscount: "48000.01", isFirstInvoice: false }),
    ).toThrow(BusinessRuleError);
    expect(() =>
      buildInvoiceLines({ annualFee: "48000", setupFee: "-5", isFirstInvoice: true }),
    ).toThrow(BusinessRuleError);
  });
});

describe("assertPaidAmount (mark-paid guard)", () => {
  it("rejects a typo'd short payment unless accept_partial is set", () => {
    expect(() => assertPaidAmount("150000.0000", "15000.00", {})).toThrow(BusinessRuleError);
    expect(() =>
      assertPaidAmount("150000.0000", "15000.00", { accept_partial: true }),
    ).not.toThrow();
  });

  it("rejects an over-payment unless accept_over is set", () => {
    expect(() => assertPaidAmount("150000", "150000.01", { accept_partial: true })).toThrow(
      BusinessRuleError,
    );
    expect(() => assertPaidAmount("150000", "150000.01", { accept_over: true })).not.toThrow();
  });

  it("accepts an exact amount regardless of scale", () => {
    expect(() => assertPaidAmount("150000.0000", "150000", {})).not.toThrow();
  });
});

describe("formatInvoiceNumber (design D2)", () => {
  it("renders SINV-{YYYY}-{seq} zero-padded", () => {
    expect(formatInvoiceNumber(2026, "7")).toBe("SINV-2026-0007");
    expect(formatInvoiceNumber(2027, 12345)).toBe("SINV-2027-12345");
  });
});
