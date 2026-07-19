import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
import { PermissionsProvider } from "@erp/ui";
import type { Permission } from "@erp/contracts";
import i18n from "../../../i18n/i18n";
import { validateDashboardSearch } from "../../../reporting/search";
import { ReportDashboardPage } from "./dashboard-detail";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(handler: (url: string) => Response | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(handler(url) ?? jsonResponse({}, 404));
    }),
  );
}

function panelsResponse(panels: Array<{ key: string; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, string>>; totals: Record<string, string> }>) {
  return jsonResponse({
    panels: panels.map((p) => ({ key: p.key, data: { window: {}, columns: p.columns, rows: p.rows, totals: p.totals } })),
  });
}

async function renderDashboard(group: "inventory" | "cost", permissions: Permission[]) {
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PermissionsProvider permissions={permissions} isSuperAdmin={false}>
          <Outlet />
        </PermissionsProvider>
      </QueryClientProvider>
    ),
  });
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: `/reports/dashboards/${group}`,
    component: ReportDashboardPage,
    staticData: {
      title: group === "inventory" ? "reporting:nav.dashboardInventory" : "reporting:nav.dashboardCost",
      navKey: "reports",
      reportGroup: group,
    },
    validateSearch: validateDashboardSearch,
  });
  const reportRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reports/$reportKey", component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([dashboardRoute, reportRoute]),
    history: createMemoryHistory({ initialEntries: [`/reports/dashboards/${group}`] }),
  });
  await router.load();
  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("ReportDashboardPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a KPI + chart card per panel in the group", async () => {
    stubFetch((url) => {
      if (url.includes("/dashboards/inventory")) {
        return panelsResponse([
          { key: "stock.balance", columns: [{ key: "item_id", label: "Item" }, { key: "value", label: "Value" }], rows: [{ item_id: "i1", value: "250.0000" }], totals: { value: "250.0000" } },
        ]);
      }
      return undefined;
    });

    await renderDashboard("inventory", ["report.inventory.view"]);

    expect(await screen.findByText("Inventory dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Stock balance")).toBeInTheDocument();
    expect(screen.getByText("฿250.0000")).toBeInTheDocument();
    expect(screen.getByText("View report")).toBeInTheDocument();
  });

  it("masks a cost dashboard without inventory.cost.view instead of fetching it", async () => {
    let fetched = false;
    stubFetch((url) => {
      if (url.includes("/dashboards/cost")) {
        fetched = true;
        return panelsResponse([]);
      }
      return undefined;
    });

    await renderDashboard("cost", ["report.cost.view"]);

    expect(await screen.findByText("Restricted — requires cost access")).toBeInTheDocument();
    expect(fetched).toBe(false);
  });
});
