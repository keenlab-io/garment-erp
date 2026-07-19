import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { InvoiceStatus, PaymentMethod, asMoney, asQty } from "@erp/contracts";
import type { Customer, Invoice } from "@erp/contracts";
import { ToastProvider, TooltipProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { LocaleProvider } from "../../../i18n/locale-context";
import { SessionProvider } from "../../../session/session-context";
import { superAdmin } from "../../../test/render";
import { __resetSalesDocumentStoreForTests, upsertInvoice } from "../../../sales/document-store";
import { PaymentsPage } from "./payments";

const CUSTOMER: Customer = {
  id: "c1",
  name: "Siam Garments Co.",
  tax_id: "0105561000001",
  branch_code: "00000",
  addresses: [],
  credit_terms_days: 30,
  version: 0,
};

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    doc_no: "IV20260001",
    quotation_id: null,
    customer_id: "c1",
    issue_date: "2026-01-01",
    due_date: null,
    wht_rate: null,
    status: InvoiceStatus.ISSUED,
    lines: [{ id: "l1", item_id: null, description: "Cotton fabric", qty: asQty("2"), unit_price: asMoney("100.0000"), discount: asMoney("0.0000"), line_total: asMoney("200.0000") }],
    subtotal: asMoney("200.0000"),
    vat_amount: asMoney("14.0000"),
    wht_amount: asMoney("0.0000"),
    grand_total: asMoney("214.0000"),
    amount_paid: asMoney("0.0000"),
    version: 0,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(handler(url, init) ?? jsonResponse({}, 404));
    }),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <LocaleProvider>
        <SessionProvider initialUser={superAdmin}>
          <TooltipProvider delayDuration={300}>
            <ToastProvider>
              <QueryClientProvider client={queryClient}>
                <PaymentsPage />
              </QueryClientProvider>
            </ToastProvider>
          </TooltipProvider>
        </SessionProvider>
      </LocaleProvider>
    </I18nextProvider>,
  );
}

describe("PaymentsPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetSalesDocumentStoreForTests();
  });

  it("recording a full payment flips the invoice to Paid and shows the issued receipt (design MD5)", async () => {
    upsertInvoice(invoice(), null, CUSTOMER);
    stubFetch((url, init) => {
      if (url.includes("/invoices/i1/payments") && init?.method === "POST") {
        return jsonResponse(
          {
            payment: { id: "p1", invoice_id: "i1", amount: asMoney("214.0000"), method: PaymentMethod.TRANSFER, promptpay_ref: null, paid_at: "2026-01-05T10:00:00.000Z" },
            receipt: { id: "r1", doc_no: "RC20260001", invoice_id: "i1", type: "RECEIPT", paid_at: "2026-01-05T10:00:00.000Z" },
          },
          201,
        );
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("IV20260001"));
    // The amount field defaults to the full outstanding balance (§4.3 "full/partial").
    expect(screen.getByLabelText("Amount")).toHaveValue(214);

    await user.click(screen.getByRole("button", { name: "Record payment" }));

    expect(await screen.findByText("RC20260001")).toBeInTheDocument();
    // Both the invoice-picker card and the detail header now carry the Paid lifecycle chip.
    expect(screen.getAllByText("Paid")).toHaveLength(2);
    // PAID is no longer payable — the record-payment form drops off.
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("blocks void with an explanatory dialog when a receipt already exists, instead of failing silently (design MD5/FD6)", async () => {
    upsertInvoice(invoice({ status: InvoiceStatus.PAID, amount_paid: asMoney("214.0000") }), {
      id: "r1",
      doc_no: "RC20260001",
      invoice_id: "i1",
      type: "RECEIPT",
      paid_at: "2026-01-05T10:00:00.000Z",
    }, CUSTOMER);
    stubFetch((url, init) => {
      if (url.includes("/invoices/i1/void") && init?.method === "POST") {
        return jsonResponse({ code: "STATE_CONFLICT", message: "A receipt already exists for this invoice" }, 409);
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("IV20260001"));
    await user.click(screen.getByRole("button", { name: "Void" }));

    // The guarded ConfirmDialog (FD6) requires a reason before it will submit — the label reads
    // "Reason*" (a required-marker glyph appended, no separating space).
    await user.type(screen.getByLabelText(/Reason/), "Customer requested cancellation");
    await user.click(screen.getByRole("button", { name: "Void" }));

    expect(await screen.findByText("Can't void this invoice")).toBeInTheDocument();
    expect(
      screen.getByText("A receipt or tax invoice has already been issued for this invoice, so it can't be voided."),
    ).toBeInTheDocument();
    // The guarded confirm dialog itself is gone — replaced by the explanatory one, not stacked.
    await waitFor(() => expect(screen.queryByText("Void IV20260001?")).not.toBeInTheDocument());
    // Never a silent fail: the invoice stays PAID, not quietly voided.
    expect(screen.getAllByText("Paid")).toHaveLength(2);
  });
});
