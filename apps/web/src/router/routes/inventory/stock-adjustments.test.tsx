import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { PermissionsProvider, ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { StockAdjustmentsPage } from "./stock-adjustments";

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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <PermissionsProvider permissions={["inventory.adjustment.approve"]} isSuperAdmin={false}>
            <StockAdjustmentsPage />
          </PermissionsProvider>
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("StockAdjustmentsPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks submit with an inline field error when the reason is blank", async () => {
    let createCalled = false;
    stubFetch((url, init) => {
      if (url.includes("/items")) return jsonResponse({ data: [ITEM], next_cursor: null });
      if (url.endsWith("/stock-adjustments") && init?.method === "POST") {
        createCalled = true;
        return jsonResponse({ adjustment: { id: "adj1", reason: "", status: "DRAFT", lines: [] } }, 201);
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Create adjustment" }));

    expect(await screen.findByText("A reason is required.")).toBeInTheDocument();
    expect(createCalled).toBe(false);
  });

  it("submits once a reason is entered", async () => {
    stubFetch((url, init) => {
      if (url.includes("/items")) return jsonResponse({ data: [ITEM], next_cursor: null });
      if (url.endsWith("/stock-adjustments") && init?.method === "POST") {
        return jsonResponse(
          { adjustment: { id: "adj1", reason: "cycle count variance", status: "DRAFT", lines: [] } },
          201,
        );
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^Reason/), "cycle count variance");
    await user.click(screen.getByRole("combobox", { name: "Item" }));
    await user.click(await screen.findByRole("option", { name: "AA00001 · Cotton Fabric" }));
    await user.click(screen.getByRole("button", { name: "Create adjustment" }));

    expect(await screen.findByText("Reason: cycle count variance")).toBeInTheDocument();
    expect(screen.queryByText("A reason is required.")).not.toBeInTheDocument();
  });
});
