import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { PermissionsProvider, ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { GoodsIssuesPage } from "./goods-issues";

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
          <PermissionsProvider permissions={["inventory.issue.manage"]} isSuperAdmin={false}>
            <GoodsIssuesPage />
          </PermissionsProvider>
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("GoodsIssuesPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the exact remaining qty inline when posting 422s on insufficient stock", async () => {
    stubFetch((url, init) => {
      if (url.includes("/items")) return jsonResponse({ data: [ITEM], next_cursor: null });
      if (url.endsWith("/goods-issues") && init?.method === "POST") {
        return jsonResponse({ issue: { id: "gi1", status: "DRAFT", lines: [] } }, 201);
      }
      if (url.includes("/goods-issues/gi1/post")) {
        return jsonResponse(
          {
            code: "VALIDATION_ERROR",
            message: "Insufficient stock",
            details: [
              { field: "item_id", issue: "i1" },
              { field: "remaining_qty", issue: "12.000000" },
            ],
          },
          422,
        );
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    const scanInput = await screen.findByPlaceholderText("Scan or enter a code");
    await user.type(scanInput, "AA00001{enter}");
    await user.click(screen.getByRole("button", { name: "Post issue" }));

    expect(await screen.findByText(/12\.000000 Cotton Fabric/)).toBeInTheDocument();
  });

  it("posts successfully and clears the scan list when stock is sufficient", async () => {
    stubFetch((url, init) => {
      if (url.includes("/items")) return jsonResponse({ data: [ITEM], next_cursor: null });
      if (url.endsWith("/goods-issues") && init?.method === "POST") {
        return jsonResponse({ issue: { id: "gi1", status: "DRAFT", lines: [] } }, 201);
      }
      if (url.includes("/goods-issues/gi1/post")) {
        return jsonResponse({ issue: { id: "gi1", status: "POSTED", lines: [] } }, 200);
      }
      return undefined;
    });

    const user = userEvent.setup();
    renderPage();

    const scanInput = await screen.findByPlaceholderText("Scan or enter a code");
    await user.type(scanInput, "AA00001{enter}");
    expect(screen.getByText("AA00001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Post issue" }));

    await waitFor(() => expect(screen.queryByText("AA00001")).not.toBeInTheDocument());
    expect(screen.queryByText(/Insufficient stock/)).not.toBeInTheDocument();
  });
});
