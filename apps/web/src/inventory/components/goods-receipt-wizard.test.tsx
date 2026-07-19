import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { PermissionsProvider, ToastProvider } from "@erp/ui";
import i18n from "../../i18n/i18n";
import { GoodsReceiptWizard } from "./goods-receipt-wizard";

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

const ITEM = { id: "i1", code: "AA00001", name: "Cotton Fabric", base_uom_id: "u1" };

function renderWizard(onCreated: (code: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
            <GoodsReceiptWizard open onOpenChange={() => {}} onCreated={onCreated} />
          </PermissionsProvider>
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("GoodsReceiptWizard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("previews landed cost per line, then creates and confirms the receipt on submit", async () => {
    let confirmedId: string | undefined;
    stubFetch((url, init) => {
      if (url.includes("/items")) return jsonResponse({ data: [ITEM], next_cursor: null });
      if (url.endsWith("/goods-receipts") && init?.method === "POST") {
        return jsonResponse({ receipt: { id: "gr1", code: "GR-0001", status: "DRAFT", lines: [] } }, 201);
      }
      if (url.includes("/goods-receipts/gr1/confirm")) {
        confirmedId = "gr1";
        return jsonResponse({ receipt: { id: "gr1", code: "GR-0001", status: "CONFIRMED", lines: [] } }, 200);
      }
      return undefined;
    });

    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderWizard(onCreated);

    await user.type(screen.getByLabelText(/^Supplier ID/), "sup-1");
    await user.click(screen.getByRole("combobox", { name: "Item" }));
    await user.click(await screen.findByRole("option", { name: "AA00001 · Cotton Fabric" }));
    await user.clear(screen.getByLabelText("Qty"));
    await user.type(screen.getByLabelText("Qty"), "100");
    await user.clear(screen.getByLabelText("Unit price"));
    await user.type(screen.getByLabelText("Unit price"), "50");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Cotton Fabric")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Review lines")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create & confirm receipt" }));

    await vi.waitFor(() => expect(confirmedId).toBe("gr1"));
    expect(onCreated).toHaveBeenCalledWith("GR-0001");
  });
});
