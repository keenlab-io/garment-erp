import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n/i18n";
import { LocaleProvider } from "../../i18n/locale-context";
import { DensityProvider } from "../../density/density-context";
import { DashboardPage } from "./dashboard";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(byPath: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const match = Object.entries(byPath).find(([path]) => url.includes(path));
      return Promise.resolve(match ? match[1]() : jsonResponse({}, 404));
    }),
  );
}

/** Renders the dashboard inside the same provider stack the real shell threads through it. */
async function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <DensityProvider>
            <DashboardPage />
          </DensityProvider>
        </LocaleProvider>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("DashboardPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders API health and the customer list once both requests resolve", async () => {
    stubFetch({
      "/health": () => jsonResponse({ status: "ok", uptime: 12.3 }),
      "/customers": () =>
        jsonResponse({
          data: [
            {
              id: "1",
              name: "Siam Textile Co.",
              tax_id: "1234567890123",
              branch_code: null,
              addresses: [],
              credit_terms_days: 30,
              version: 1,
            },
          ],
          next_cursor: null,
        }),
    });

    await renderDashboard();

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(await screen.findByText("Siam Textile Co.")).toBeInTheDocument();
  });

  it("shows the empty state when there are no customers", async () => {
    stubFetch({
      "/health": () => jsonResponse({ status: "ok", uptime: 1 }),
      "/customers": () => jsonResponse({ data: [], next_cursor: null }),
    });

    await renderDashboard();

    expect(await screen.findByText("No customers yet.")).toBeInTheDocument();
  });

  it("shows an error state with retry when the customer list request fails", async () => {
    stubFetch({
      "/health": () => jsonResponse({ status: "ok", uptime: 1 }),
      "/customers": () =>
        jsonResponse({ code: "UNAUTHENTICATED", message: "no token", details: [] }, 401),
    });

    await renderDashboard();

    expect(
      await screen.findByText("Couldn't load customers. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
