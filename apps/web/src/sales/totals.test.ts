import { describe, expect, it } from "vitest";
import { asMoney, asQty, type DocLineInput } from "@erp/contracts";
import { computeDocumentTotals, lineTotal, netToReceive } from "./totals";

// Same spec §5.8 worked examples as `apps/api/src/sales/totals.service.spec.ts` — the live
// preview (design MD1) must never disagree with what the server will persist.
describe("computeDocumentTotals", () => {
  function line(qty: string, unitPrice: string, discount?: string): DocLineInput {
    return {
      description: "Item",
      qty: asQty(qty),
      unit_price: asMoney(unitPrice),
      ...(discount ? { discount: asMoney(discount) } : {}),
    };
  }

  it("VatNok (exclude) — a ฿100 line yields subtotal 100 / VAT 7 / grand 107", () => {
    const r = computeDocumentTotals([line("1", "100")], { vat_mode: "VAT", vat_calc: "VatNok" });
    expect(r.subtotal).toBe("100.0000");
    expect(r.vat_amount).toBe("7.0000");
    expect(r.grand_total).toBe("107.0000");
  });

  it("VatNai (include) — a ฿107 line backs out to subtotal 100 / VAT 7 / grand 107", () => {
    const r = computeDocumentTotals([line("1", "107")], { vat_mode: "VAT", vat_calc: "VatNai" });
    expect(r.subtotal).toBe("100.0000");
    expect(r.vat_amount).toBe("7.0000");
    expect(r.grand_total).toBe("107.0000");
  });

  it("switching VAT inclusive/exclusive re-breaks the same line differently", () => {
    const excl = computeDocumentTotals([line("1", "100")], { vat_mode: "VAT", vat_calc: "VatNok" });
    const incl = computeDocumentTotals([line("1", "100")], { vat_mode: "VAT", vat_calc: "VatNai" });
    expect(excl.grand_total).toBe("107.0000");
    expect(incl.grand_total).toBe("100.0000");
  });

  it("Non-VAT — no VAT is added and only the subtotal is billed", () => {
    const r = computeDocumentTotals([line("1", "500")], { vat_mode: "NON_VAT", vat_calc: "VatNok" });
    expect(r.subtotal).toBe("500.0000");
    expect(r.vat_amount).toBe("0.0000");
    expect(r.grand_total).toBe("500.0000");
  });

  it("WHT — a ฿100,000 services invoice at 3% yields a 3,000 certificate and net 97,000", () => {
    const r = computeDocumentTotals([line("1", "100000")], {
      vat_mode: "NON_VAT",
      vat_calc: "VatNok",
      wht_rate: "0.03",
    });
    expect(r.subtotal).toBe("100000.0000");
    expect(r.wht_amount).toBe("3000.0000");
    expect(netToReceive(r.grand_total, r.wht_amount)).toBe("97000.0000");
  });

  it("applies a per-line discount before summing", () => {
    const r = computeDocumentTotals([line("2", "100", "50")], { vat_mode: "NON_VAT", vat_calc: "VatNok" });
    expect(r.subtotal).toBe("150.0000");
    expect(r.lines[0]?.line_total).toBe("150.0000");
  });

  it("has no withholding when wht_rate is absent", () => {
    const r = computeDocumentTotals([line("1", "100")], { vat_mode: "NON_VAT", vat_calc: "VatNok" });
    expect(r.wht_amount).toBe("0.0000");
  });
});

describe("lineTotal", () => {
  it("computes qty × unit_price − discount", () => {
    expect(lineTotal({ description: "x", qty: asQty("3"), unit_price: asMoney("10.00") })).toBe("30.0000");
    expect(
      lineTotal({ description: "x", qty: asQty("3"), unit_price: asMoney("10.00"), discount: asMoney("5.00") }),
    ).toBe("25.0000");
  });
});
