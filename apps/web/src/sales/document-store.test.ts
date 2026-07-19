import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QuotationStatus, InvoiceStatus, VatApplicability, VatMode, asMoney } from "@erp/contracts";
import type { Invoice, Quotation } from "@erp/contracts";
import {
  __resetSalesDocumentStoreForTests,
  getDocument,
  isQuotationExpired,
  upsertInvoice,
  upsertQuotation,
  useSalesDocuments,
} from "./document-store.js";

function makeQuotation(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: "q1",
    doc_no: "QV20260001",
    customer_id: "c1",
    vat_mode: VatApplicability.VAT,
    vat_calc: VatMode.VatNok,
    valid_until: "2026-01-01",
    status: QuotationStatus.SENT,
    lines: [],
    subtotal: asMoney("0.00"),
    vat_amount: asMoney("0.00"),
    grand_total: asMoney("0.00"),
    version: 0,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    doc_no: "IV20260001",
    quotation_id: null,
    customer_id: "c1",
    issue_date: "2026-01-01",
    due_date: null,
    wht_rate: null,
    status: InvoiceStatus.ISSUED,
    lines: [],
    subtotal: asMoney("0.00"),
    vat_amount: asMoney("0.00"),
    wht_amount: asMoney("0.00"),
    grand_total: asMoney("0.00"),
    amount_paid: asMoney("0.00"),
    version: 0,
    ...overrides,
  };
}

afterEach(() => __resetSalesDocumentStoreForTests());

describe("document-store", () => {
  it("upserts a quotation and reads it back", () => {
    const quotation = makeQuotation();
    upsertQuotation(quotation);
    expect(getDocument("q1")).toEqual({
      kind: "quotation",
      quotation,
      customer: null,
      updatedAt: expect.any(String),
    });
  });

  it("preserves an invoice's receipt across an update that doesn't supply one", () => {
    const invoice = makeInvoice();
    const receipt = { id: "r1", doc_no: "RC20260001", invoice_id: "i1", type: "RECEIPT" as const, paid_at: "2026-01-02T00:00:00Z" };
    upsertInvoice(invoice, receipt);
    const updated = { ...invoice, amount_paid: asMoney("50.00") };
    upsertInvoice(updated);
    const record = getDocument("i1");
    expect(record?.kind).toBe("invoice");
    if (record?.kind === "invoice") {
      expect(record.receipt).toEqual(receipt);
      expect(record.invoice.amount_paid).toBe("50.00");
    }
  });

  it("notifies subscribers via useSalesDocuments", () => {
    const { result } = renderHook(() => useSalesDocuments());
    expect(result.current).toHaveLength(0);
    act(() => upsertQuotation(makeQuotation()));
    expect(result.current).toHaveLength(1);
  });

  it("flags an expired-but-unswept quotation past its valid_until", () => {
    const expired = makeQuotation({ valid_until: "2020-01-01", status: QuotationStatus.SENT });
    expect(isQuotationExpired(expired, new Date("2026-01-01"))).toBe(true);
    expect(isQuotationExpired(makeQuotation({ status: QuotationStatus.APPROVED, valid_until: "2020-01-01" }), new Date("2026-01-01"))).toBe(false);
    expect(isQuotationExpired(makeQuotation({ valid_until: null }), new Date("2026-01-01"))).toBe(false);
  });
});
