import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { QuotationStatus, InvoiceStatus, VatApplicability, VatMode, asMoney, asQty } from "@erp/contracts";
import type { Customer, Invoice, Quotation } from "@erp/contracts";
import { ToastProvider, TooltipProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { LocaleProvider } from "../../../i18n/locale-context";
import { SessionProvider } from "../../../session/session-context";
import { superAdmin } from "../../../test/render";
import { __resetSalesDocumentStoreForTests, upsertQuotation } from "../../../sales/document-store";
import { DocumentEditPage } from "./document-editor";

const CUSTOMER: Customer = {
  id: "c1",
  name: "Siam Garments Co.",
  tax_id: "0105561000001",
  branch_code: "00000",
  addresses: [
    {
      line1: "99 Sukhumvit Rd",
      subdistrict: "Khlong Toei",
      district: "Khlong Toei",
      province: "Bangkok",
      postal_code: "10110",
      is_default: true,
    },
  ],
  credit_terms_days: 30,
  version: 0,
};

function quotation(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: "q1",
    doc_no: "QV20260001",
    customer_id: "c1",
    vat_mode: VatApplicability.VAT,
    vat_calc: VatMode.VatNok,
    valid_until: null,
    status: QuotationStatus.SENT,
    lines: [{ id: "l1", item_id: null, description: "Cotton fabric", qty: asQty("2"), unit_price: asMoney("100.0000"), discount: asMoney("0.0000"), line_total: asMoney("200.0000") }],
    subtotal: asMoney("200.0000"),
    vat_amount: asMoney("14.0000"),
    grand_total: asMoney("214.0000"),
    version: 0,
    ...overrides,
  };
}

function invoiceDraft(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1",
    doc_no: "IV20260001",
    quotation_id: "q1",
    customer_id: "c1",
    issue_date: "2026-01-01",
    due_date: null,
    wht_rate: null,
    status: InvoiceStatus.DRAFT,
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

/** Mounts `DocumentEditPage` on a standalone router at `/sales/documents/{id}/edit` — the same
 * leaf shape `route-tree.tsx` registers, minus the guards/chrome this screen doesn't need. */
async function renderEditor(id: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <LocaleProvider>
        <SessionProvider initialUser={superAdmin}>
          <TooltipProvider delayDuration={300}>
            <ToastProvider>
              <Outlet />
            </ToastProvider>
          </TooltipProvider>
        </SessionProvider>
      </LocaleProvider>
    ),
  });
  const editRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sales/documents/$id/edit", component: DocumentEditPage });
  const worklistRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sales/documents", component: () => null });
  const paymentsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sales/payments", component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([editRoute, worklistRoute, paymentsRoute]),
    history: createMemoryHistory({ initialEntries: [`/sales/documents/${id}/edit`] }),
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return router;
}

describe("DocumentEditPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetSalesDocumentStoreForTests();
  });

  it("customer autocomplete fills the live preview's tax fields, and the VAT toggle re-breaks the totals", async () => {
    stubFetch((url) => {
      if (url.includes("/customers")) return jsonResponse({ data: [CUSTOMER], next_cursor: null });
      if (url.includes("/items")) return jsonResponse({ data: [], next_cursor: null });
      return undefined;
    });

    const user = userEvent.setup();
    await renderEditor("new");

    await user.click(screen.getByRole("combobox", { name: "Customer" }));
    await user.click(await screen.findByText("Siam Garments Co. · 0105561000001"));

    // The preview's "Bill to" block is filled straight from the selected customer (design MD3) —
    // scope to the paper-preview surface since the autocomplete itself also echoes these fields.
    const preview = (await screen.findByText("ใบเสนอราคา / Quotation")).closest("div.rounded-md") as HTMLElement;
    expect(within(preview).getByText("0105561000001")).toBeInTheDocument();
    expect(within(preview).getByText("00000")).toBeInTheDocument();
    expect(within(preview).getByText(/99 Sukhumvit Rd/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Description"), "Cotton fabric");
    await user.clear(screen.getByLabelText("Qty"));
    await user.type(screen.getByLabelText("Qty"), "2");
    await user.clear(screen.getByLabelText("Unit price"));
    await user.type(screen.getByLabelText("Unit price"), "100");

    // Default calc is exclusive (VatNok, §3.3 default) — VAT is added on top of the 200 subtotal.
    // Scope to the preview's "Grand total" row since ฿200.00/฿214.00 also appear as line amounts.
    const grandTotalRow = () => screen.getByText("Grand total").closest("div") as HTMLElement;
    await waitFor(() => expect(within(grandTotalRow()).getByText("฿214.00")).toBeInTheDocument());

    // Flipping to inclusive (VatNai) re-breaks the SAME line total differently: it now reads as
    // VAT-inclusive, so the 200 line total becomes the grand total and VAT is backed out of it.
    await user.click(screen.getByRole("radio", { name: "Incl." }));
    await waitFor(() => expect(within(grandTotalRow()).getByText("฿200.00")).toBeInTheDocument());
  });

  it("creating a quotation navigates into the record and shows its Draft lifecycle chip", async () => {
    stubFetch((url, init) => {
      if (url.includes("/customers")) return jsonResponse({ data: [CUSTOMER], next_cursor: null });
      if (url.includes("/items")) return jsonResponse({ data: [], next_cursor: null });
      if (url.endsWith("/quotations") && init?.method === "POST") {
        return jsonResponse({ quotation: quotation({ status: QuotationStatus.DRAFT }) }, 201);
      }
      return undefined;
    });

    const user = userEvent.setup();
    await renderEditor("new");

    await user.click(screen.getByRole("combobox", { name: "Customer" }));
    await user.click(await screen.findByText("Siam Garments Co. · 0105561000001"));
    await user.type(screen.getByLabelText("Description"), "Cotton fabric");

    await user.click(screen.getByRole("button", { name: "Create quotation" }));

    expect(await screen.findByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "QV20260001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("the approved-quotation → invoice → issued lifecycle reveals the PromptPay QR (design MD2)", async () => {
    upsertQuotation(quotation({ status: QuotationStatus.APPROVED }), CUSTOMER);

    stubFetch((url, init) => {
      if (url.includes("/quotations/q1/convert") && init?.method === "POST") {
        return jsonResponse({ invoice: invoiceDraft() }, 201);
      }
      if (url.includes("/invoices/i1/issue") && init?.method === "POST") {
        return jsonResponse({ invoice: invoiceDraft({ status: InvoiceStatus.ISSUED }) }, 200);
      }
      if (url.includes("/invoices/i1/promptpay-qr")) {
        return jsonResponse({ payload: "00020101021129370016A000000677010111", png_base64: "Zm9v" });
      }
      return undefined;
    });

    const user = userEvent.setup();
    await renderEditor("q1");

    await user.click(screen.getByRole("button", { name: "Convert to invoice" }));
    await screen.findByRole("heading", { level: 1, name: "IV20260001" });

    await user.click(screen.getByRole("button", { name: "Issue" }));

    expect(await screen.findByAltText("PromptPay")).toBeInTheDocument();
    expect(screen.getByText(/00020101021129370016A000000677010111/)).toBeInTheDocument();
  });
});
