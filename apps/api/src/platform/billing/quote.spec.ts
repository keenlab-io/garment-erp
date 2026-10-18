import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { asMoney, type QuoteComputeRequest, type QuoteEligibility, type QuoteFees } from "@erp/contracts";
import type { PdfService } from "../../pdf/pdf.service.js";
import type { StorageService } from "../../storage/storage.service.js";
import { renderQuoteHtml } from "./quote-pdf.js";
import { bangkokDate, benefitApplies, computeQuote, taxBenefit } from "./quote-math.js";
import { QuoteService } from "./quote.service.js";
import { TAX_BENEFIT_CONFIGS, taxBenefitConfigFor, type TaxBenefitConfig } from "./tax-benefit-config.js";

// M9 §5 — tax-benefit quoting: the benefit appears only when both declarations are true, the
// quote is dated on/before the sunset, and the depa flag is on; it is capped at the configured
// annual spend; and the accountant caveat rides along on every PDF.

const CONFIG = taxBenefitConfigFor("2026-10-18");

const ELIGIBLE: QuoteEligibility = {
  registered_capital_at_most_5m: true,
  annual_revenue_at_most_30m: true,
  declared_by: "Khun Somchai (owner)",
  declared_at: "2026-10-18T03:00:00.000Z",
};

function fees(annual: string, setup?: string, discount?: string): QuoteFees {
  return {
    annual_fee: asMoney(annual),
    ...(setup !== undefined ? { setup_fee: asMoney(setup) } : {}),
    ...(discount !== undefined ? { upfront_discount: asMoney(discount) } : {}),
  };
}

/** An eligible Factory quote totalling ฿280,000 (GTM's worked example). */
function factoryQuote(overrides: Partial<QuoteComputeRequest> = {}): QuoteComputeRequest {
  return {
    plan: "FACTORY",
    fees: fees("180000", "100000", "0"),
    term: 1,
    quote_date: "2026-10-18",
    eligibility: ELIGIBLE,
    ...overrides,
  };
}

const CTX = { today: "2026-10-18", catalogRegistered: true };

describe("tax-benefit config", () => {
  it("is versioned data carrying the sunset, cap, band and caveat", () => {
    expect(CONFIG.sunset).toBe("2027-12-31");
    expect(CONFIG.annualCap).toBe("300000");
    expect(CONFIG.citRateBand).toEqual({ min: "0.15", max: "0.20" });
    expect(CONFIG.caveat).toMatch(/illustrative/);
    expect(CONFIG.caveat).toMatch(/accountant/);
  });

  it("picks the latest version effective on the quote date", () => {
    const v2: TaxBenefitConfig = { ...CONFIG, version: "v2", effectiveFrom: "2027-06-01" };
    const configs = [...TAX_BENEFIT_CONFIGS, v2];
    expect(taxBenefitConfigFor("2027-05-31", configs).version).toBe(CONFIG.version);
    expect(taxBenefitConfigFor("2027-06-01", configs).version).toBe("v2");
    expect(taxBenefitConfigFor("2020-01-01", configs).version).toBe(CONFIG.version);
  });
});

describe("benefitApplies", () => {
  it("requires both declarations, a pre-sunset date and the depa flag", () => {
    expect(benefitApplies(ELIGIBLE, "2026-10-18", true, CONFIG)).toBe(true);
    expect(benefitApplies(ELIGIBLE, "2027-12-31", true, CONFIG)).toBe(true);
    expect(benefitApplies(ELIGIBLE, "2028-01-01", true, CONFIG)).toBe(false);
    expect(benefitApplies(ELIGIBLE, "2026-10-18", false, CONFIG)).toBe(false);
    expect(benefitApplies(undefined, "2026-10-18", true, CONFIG)).toBe(false);
    expect(
      benefitApplies({ ...ELIGIBLE, annual_revenue_at_most_30m: false }, "2026-10-18", true, CONFIG),
    ).toBe(false);
    expect(
      benefitApplies({ ...ELIGIBLE, registered_capital_at_most_5m: false }, "2026-10-18", true, CONFIG),
    ).toBe(false);
  });

  it("follows the configured sunset, not a literal", () => {
    const extended = { ...CONFIG, sunset: "2029-12-31" };
    expect(benefitApplies(ELIGIBLE, "2028-01-01", true, extended)).toBe(true);
  });
});

describe("taxBenefit", () => {
  it("reproduces the GTM worked example on ฿280,000", () => {
    const tb = taxBenefit("280000", CONFIG);
    expect(tb.qualifying_spend).toBe("280000.0000");
    expect(tb.non_qualifying_spend).toBe("0.0000");
    expect(tb.extra_deduction).toBe("280000.0000");
    expect(tb.estimated_saving).toEqual({ min: "42000.0000", max: "56000.0000" });
    expect(tb.effective_price).toEqual({ min: "224000.0000", max: "238000.0000" });
    expect(tb.caveat).toBe(CONFIG.caveat);
  });

  it("caps qualifying spend and marks the over-cap remainder non-qualifying", () => {
    const tb = taxBenefit("400000", CONFIG);
    expect(tb.qualifying_spend).toBe("300000.0000");
    expect(tb.non_qualifying_spend).toBe("100000.0000");
    expect(tb.estimated_saving).toEqual({ min: "45000.0000", max: "60000.0000" });
    expect(tb.effective_price).toEqual({ min: "340000.0000", max: "355000.0000" });
  });

  it("reads the rate band from config", () => {
    const tb = taxBenefit("100000", { ...CONFIG, citRateBand: { min: "0.10", max: "0.25" } });
    expect(tb.estimated_saving).toEqual({ min: "10000.0000", max: "25000.0000" });
  });
});

describe("computeQuote", () => {
  it("returns the first-year lines at list and the benefit for an eligible Factory quote", () => {
    const q = computeQuote(factoryQuote(), CTX);
    expect(q.lines.map((l) => l.kind)).toEqual(["ANNUAL_FEE", "SETUP_FEE"]);
    expect(q.first_year_total).toBe("280000.0000");
    expect(q.eligibility).toEqual(ELIGIBLE);
    expect(q.tax_benefit?.estimated_saving).toEqual({ min: "42000.0000", max: "56000.0000" });
    expect(q.tax_benefit?.caveat).toBe(CONFIG.caveat);
  });

  it("matches the invoice lines — default up-front discount included", () => {
    const q = computeQuote(factoryQuote({ fees: fees("180000") }), CTX);
    expect(q.lines.map((l) => [l.kind, l.amount])).toEqual([
      ["ANNUAL_FEE", "180000.0000"],
      ["UPFRONT_DISCOUNT", "-30000.0000"],
    ]);
    expect(q.first_year_total).toBe("150000.0000");
  });

  it("omits the benefit key entirely for a >฿30M-revenue prospect", () => {
    const q = computeQuote(
      factoryQuote({ eligibility: { ...ELIGIBLE, annual_revenue_at_most_30m: false } }),
      CTX,
    );
    expect(q.first_year_total).toBe("280000.0000");
    expect("tax_benefit" in q).toBe(false);
  });

  it("omits the benefit for a quote dated after the sunset", () => {
    expect("tax_benefit" in computeQuote(factoryQuote({ quote_date: "2028-01-01" }), CTX)).toBe(
      false,
    );
  });

  it("treats a missing eligibility block as undeclared", () => {
    const q = computeQuote(factoryQuote({ eligibility: undefined }), CTX);
    expect(q.eligibility).toBeNull();
    expect("tax_benefit" in q).toBe(false);
  });

  it("omits the benefit when the vendor is not on the depa catalog", () => {
    const q = computeQuote(factoryQuote(), { ...CTX, catalogRegistered: false });
    expect("tax_benefit" in q).toBe(false);
  });

  it("computes the benefit on ฿300,000 only for a ฿400,000 first year", () => {
    const q = computeQuote(
      factoryQuote({ fees: fees("300000", "100000", "0") }),
      CTX,
    );
    expect(q.tax_benefit?.qualifying_spend).toBe("300000.0000");
    expect(q.tax_benefit?.non_qualifying_spend).toBe("100000.0000");
  });

  it("defaults the quote date to today", () => {
    const q = computeQuote(factoryQuote({ quote_date: undefined }), { ...CTX, today: "2028-03-01" });
    expect(q.quote_date).toBe("2028-03-01");
    expect("tax_benefit" in q).toBe(false);
  });
});

describe("bangkokDate", () => {
  it("is the Thai calendar date", () => {
    expect(bangkokDate(new Date("2027-12-31T16:59:59Z"))).toBe("2027-12-31");
    expect(bangkokDate(new Date("2027-12-31T17:00:00Z"))).toBe("2028-01-01");
  });
});

describe("renderQuoteHtml", () => {
  it("shows list price, the benefit section, and the caveat adjacent to it when eligible", () => {
    const quote = computeQuote(factoryQuote(), CTX);
    const html = renderQuoteHtml({ quote, caveat: CONFIG.caveat, prospectName: "Siam Tees" });
    expect(html).toContain("฿280,000.00");
    expect(html).toContain('class="tax-benefit"');
    expect(html).toContain("฿42,000.00 – ฿56,000.00");
    expect(html).toContain("฿224,000.00 – ฿238,000.00");
    expect(html).toContain("Siam Tees");
    const section = html.slice(html.indexOf('class="tax-benefit"'));
    expect(section).toContain('class="caveat"');
    expect(html).toContain("illustrative");
  });

  it("notes the over-cap spend as not qualifying", () => {
    const quote = computeQuote(
      factoryQuote({ fees: fees("300000", "100000", "0") }),
      CTX,
    );
    const html = renderQuoteHtml({ quote, caveat: CONFIG.caveat });
    expect(html).toContain("฿100,000.00 of the first-year total is above the annual cap");
  });

  it("has no benefit section — but still the caveat — when ineligible or post-sunset", () => {
    for (const req of [
      factoryQuote({ eligibility: { ...ELIGIBLE, annual_revenue_at_most_30m: false } }),
      factoryQuote({ quote_date: "2028-01-01" }),
    ]) {
      const html = renderQuoteHtml({ quote: computeQuote(req, CTX), caveat: CONFIG.caveat });
      expect(html).toContain("฿280,000.00");
      expect(html).not.toContain("tax-benefit");
      expect(html).not.toContain("saving</td>");
      expect(html).not.toContain("Effective");
      expect(html).toContain('class="caveat"');
    }
  });

  it("escapes prospect-supplied text", () => {
    const html = renderQuoteHtml({
      quote: computeQuote(factoryQuote(), CTX),
      caveat: CONFIG.caveat,
      prospectName: "<script>x</script>",
    });
    expect(html).not.toContain("<script>");
  });
});

describe("QuoteService", () => {
  function service(depa: boolean) {
    const pdf = { renderHtml: vi.fn(async () => Buffer.from("%PDF")) };
    const storage = {
      platformKey: vi.fn((k: string) => `platform/${k}`),
      put: vi.fn(async () => undefined),
      getSignedUrl: vi.fn(async () => "https://signed.example/quote.pdf"),
    };
    const config = { get: vi.fn((k: string) => (k === "DEPA_CATALOG_REGISTERED" ? depa : undefined)) };
    const svc = new QuoteService(
      pdf as unknown as PdfService,
      storage as unknown as StorageService,
      config as unknown as ConfigService,
    );
    return { svc, pdf, storage };
  }

  it("gates the benefit on the DEPA_CATALOG_REGISTERED flag", () => {
    expect(service(true).svc.compute(factoryQuote()).tax_benefit).toBeDefined();
    expect("tax_benefit" in service(false).svc.compute(factoryQuote())).toBe(false);
  });

  it("dates an undated quote with today's Bangkok date", () => {
    const q = service(true).svc.compute(
      factoryQuote({ quote_date: undefined }),
      new Date("2027-12-31T17:30:00Z"),
    );
    expect(q.quote_date).toBe("2028-01-01");
    expect("tax_benefit" in q).toBe(false);
  });

  it("renders, stores under the control-plane key space, and presigns the quote PDF", async () => {
    const { svc, pdf, storage } = service(true);
    const res = await svc.pdfUrl(factoryQuote());
    expect(res).toEqual({ url: "https://signed.example/quote.pdf" });
    const html = (pdf.renderHtml.mock.calls as unknown as string[][])[0]?.[0] ?? "";
    expect(html).toContain('class="tax-benefit"');
    expect(html).toContain(CONFIG.caveat.slice(0, 30));
    expect(storage.platformKey.mock.calls[0]?.[0] as unknown).toMatch(/^billing\/quotes\/2026-10-18-/);
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^platform\/billing\/quotes\//),
      expect.any(Buffer),
      "application/pdf",
    );
  });
});
