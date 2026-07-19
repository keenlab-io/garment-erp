import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
import { PermissionsProvider, ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { validateReportSearch } from "../../../reporting/search";
import { ReportViewerPage } from "./report-viewer";

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

async function renderViewer(reportKey: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <PermissionsProvider permissions={["report.sales.view"]} isSuperAdmin={false}>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </PermissionsProvider>
    ),
  });
  const viewerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/reports/$reportKey",
    component: ReportViewerPage,
    validateSearch: validateReportSearch,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([viewerRoute]),
    history: createMemoryHistory({ initialEntries: [`/reports/${reportKey}`] }),
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return router;
}

describe("ReportViewerPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the report's columns, rows, and totals", async () => {
    stubFetch((url) => {
      if (url.includes("/reports/sales.overview")) {
        return jsonResponse({
          columns: [
            { key: "d", label: "Date" },
            { key: "sales", label: "Sales" },
          ],
          rows: [{ d: "2026-01-01", sales: "500.0000" }],
          totals: { sales: "500.0000" },
        });
      }
      return undefined;
    });

    await renderViewer("sales.overview");

    expect(await screen.findByText("Sales overview")).toBeInTheDocument();
    expect(await screen.findAllByText("500.0000")).not.toHaveLength(0);
    expect(screen.getByText(/Total Sales:/)).toBeInTheDocument();
  });

  it("offers PDF/Excel/CSV export actions", async () => {
    stubFetch((url) => {
      if (url.includes("/reports/tax.pp30")) {
        return jsonResponse({ columns: [{ key: "d", label: "Date" }], rows: [], totals: {} });
      }
      return undefined;
    });

    await renderViewer("tax.pp30");

    expect(await screen.findByRole("button", { name: "PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EXCEL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV" })).toBeInTheDocument();
  });

  it("clears dimension/value filters when the operator edits From by hand", async () => {
    stubFetch((url) => {
      if (url.includes("/reports/sales.overview")) {
        return jsonResponse({ columns: [{ key: "d", label: "Date" }], rows: [], totals: {} });
      }
      return undefined;
    });

    const user = userEvent.setup();
    const router = await renderViewer("sales.overview");
    await router.navigate({ to: "/reports/$reportKey", params: { reportKey: "sales.overview" }, search: { dimension: "day", value: "2026-01-01" } });

    expect(await screen.findByText("day: 2026-01-01")).toBeInTheDocument();

    await user.type(screen.getByLabelText("From"), "2026-02-01");

    expect(screen.queryByText("day: 2026-01-01")).not.toBeInTheDocument();
  });
});
