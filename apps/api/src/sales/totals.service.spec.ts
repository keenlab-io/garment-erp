import { describe, expect, it } from "vitest";
import { asMoney, asQty, type DocLineInput } from "@erp/contracts";
import { toDecimal } from "@erp/utils";
import { TotalsService } from "./totals.service.js";

// Spec §5.8 worked examples (tasks 6.1/6.2): the VAT include/exclude math and WHT. All totals
// are server-computed at 4 dp half-up; these lock the Thai-accounting-correct numbers.
describe("TotalsService", () => {
  const totals = new TotalsService();

  function line(qty: string, unitPrice: string, discount?: string): DocLineInput {
    return {
      description: "Item",
      qty: asQty(qty),
      unit_price: asMoney(unitPrice),
      ...(discount ? { discount: asMoney(discount) } : {}),
    };
  }

  it("VatNok (exclude) — a ฿100 line yields subtotal 100 / VAT 7 / grand 107", () => {
    const r = totals.compute([line("1", "100")], {
      vat_mode: "VAT",
      vat_calc: "VatNok",
    });
    expect(r.subtotal).toBe("100.0000");
    expect(r.vat_amount).toBe("7.0000");
    expect(r.grand_total).toBe("107.0000");
  });

  it("VatNai (include) — a ฿107 line backs out to subtotal 100 / VAT 7 / grand 107", () => {
    const r = totals.compute([line("1", "107")], {
      vat_mode: "VAT",
      vat_calc: "VatNai",
    });
    expect(r.subtotal).toBe("100.0000");
    expect(r.vat_amount).toBe("7.0000");
    expect(r.grand_total).toBe("107.0000");
  });

  it("Non-VAT — no VAT is added and only the subtotal is billed", () => {
    const r = totals.compute([line("1", "500")], {
      vat_mode: "NON_VAT",
      vat_calc: "VatNok",
    });
    expect(r.subtotal).toBe("500.0000");
    expect(r.vat_amount).toBe("0.0000");
    expect(r.grand_total).toBe("500.0000");
  });

  it("WHT — a ฿100,000 services invoice at 3% yields a 3,000 certificate and net 97,000", () => {
    const r = totals.compute([line("1", "100000")], {
      vat_mode: "NON_VAT",
      vat_calc: "VatNok",
      wht_rate: "0.03",
    });
    expect(r.subtotal).toBe("100000.0000");
    expect(r.wht_amount).toBe("3000.0000");
    const net = toDecimal(r.grand_total).minus(toDecimal(r.wht_amount)).toString();
    expect(net).toBe("97000");
  });

  it("applies a per-line discount before summing", () => {
    const r = totals.compute([line("2", "100", "50")], {
      vat_mode: "NON_VAT",
      vat_calc: "VatNok",
    });
    // 2 × 100 − 50 = 150
    expect(r.subtotal).toBe("150.0000");
    expect(r.lines[0]?.line_total).toBe("150.0000");
  });
});
