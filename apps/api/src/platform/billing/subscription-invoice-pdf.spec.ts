import generatePayload from "promptpay-qr";
import { describe, expect, it } from "vitest";
import { asMoney, type SubscriptionInvoice } from "@erp/contracts";
import { baht, renderSubscriptionInvoiceHtml, vendorPromptPayQr } from "./subscription-invoice-pdf.js";

// M9 §3.3 — the invoice PDF's PromptPay QR pays the VENDOR (`PLATFORM_PROMPTPAY_ID`) for the
// invoice total; with no vendor id the QR section is omitted and bank transfer remains.

const VENDOR_ID = "0105561234567";

const INVOICE: SubscriptionInvoice = {
  id: "11111111-1111-4111-8111-111111111111",
  number: "SINV-2026-0001",
  subscription_id: "22222222-2222-4222-8222-222222222222",
  tenant_id: "33333333-3333-4333-8333-333333333333",
  status: "ISSUED",
  lines: [
    { kind: "ANNUAL_FEE", description: "Annual subscription fee", amount: asMoney("150000.0000") },
    { kind: "SETUP_FEE", description: "One-time setup fee", amount: asMoney("100000.0000") },
    {
      kind: "UPFRONT_DISCOUNT",
      description: "Discount for paying the year up front",
      amount: asMoney("-25000.0000"),
    },
  ],
  subtotal: asMoney("225000.0000"),
  vat_amount: asMoney("0.0000"),
  total: asMoney("225000.0000"),
  issued_at: "2026-10-18T03:00:00.000Z",
  due_date: "2026-11-17",
  paid_at: null,
  payment_method: null,
  payment_reference: null,
  paid_amount: null,
  voided_at: null,
};

describe("vendorPromptPayQr", () => {
  it("encodes PLATFORM_PROMPTPAY_ID and the invoice total", async () => {
    const qr = await vendorPromptPayQr(VENDOR_ID, INVOICE.total);
    expect(qr?.payload).toBe(generatePayload(VENDOR_ID, { amount: 225000 }));
    expect(qr?.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("is omitted when no vendor id is configured or nothing is due", async () => {
    expect(await vendorPromptPayQr(undefined, INVOICE.total)).toBeNull();
    expect(await vendorPromptPayQr(VENDOR_ID, "0.0000")).toBeNull();
  });
});

describe("renderSubscriptionInvoiceHtml", () => {
  it("shows the lines, ex-VAT totals, bank details and the vendor QR", async () => {
    const qr = await vendorPromptPayQr(VENDOR_ID, INVOICE.total);
    const html = renderSubscriptionInvoiceHtml({
      invoice: INVOICE,
      tenantName: "Siam <Garments>",
      vendor: { promptpayId: VENDOR_ID, bankName: "KBank", bankAccountNumber: "123-4-56789-0" },
      qr,
    });
    expect(html).toContain("SINV-2026-0001");
    expect(html).toContain("Siam &lt;Garments&gt;");
    expect(html).toContain("฿150,000.00");
    expect(html).toContain("-฿25,000.00");
    expect(html).toContain("฿225,000.00");
    expect(html).toContain("excluding VAT");
    expect(html).toContain("KBank");
    expect(html).toContain("123-4-56789-0");
    expect(html).toContain("PromptPay QR");
    expect(html).toContain(qr?.payload ?? "missing");
  });

  it("omits the PromptPay section without a vendor QR — bank transfer remains", () => {
    const html = renderSubscriptionInvoiceHtml({
      invoice: INVOICE,
      tenantName: "Siam Garments",
      vendor: { bankName: "KBank" },
      qr: null,
    });
    expect(html).not.toContain("PromptPay");
    expect(html).toContain("Bank transfer");
  });

  it("formats baht with the sign ahead of the currency", () => {
    expect(baht("1234.5")).toBe("฿1,234.50");
    expect(baht("-25000.0000")).toBe("-฿25,000.00");
  });
});
