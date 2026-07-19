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
import { PermissionsProvider } from "@erp/ui";
import type { Permission } from "@erp/contracts";
import i18n from "../../i18n/i18n";
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

function panelsResponse(panels: Array<{ key: string; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, string>>; totals: Record<string, string> }>) {
  return jsonResponse({
    panels: panels.map((p) => ({ key: p.key, data: { window: {}, columns: p.columns, rows: p.rows, totals: p.totals } })),
  });
}

async function renderDashboard(permissions: Permission[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <PermissionsProvider permissions={permissions} isSuperAdmin={false}>
          <DashboardPage />
        </PermissionsProvider>
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

describe("DashboardPage (M6 overview)", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a KPI card per accessible report group and the sales trend chart", async () => {
    stubFetch({
      "/dashboards/inventory": () =>
        panelsResponse([{ key: "stock.balance", columns: [{ key: "item_id", label: "Item" }, { key: "value", label: "Value" }], rows: [{ item_id: "i1", value: "100.0000" }], totals: { value: "100.0000" } }]),
      "/dashboards/sales": () =>
        panelsResponse([{ key: "sales.overview", columns: [{ key: "d", label: "Date" }, { key: "sales", label: "Sales" }], rows: [{ d: "2026-01-01", sales: "500.0000" }], totals: { sales: "500.0000" } }]),
      "/reports/low-stock": () => jsonResponse({ rows: [] }),
      "/work-orders/timeline": () => jsonResponse({ data: [] }),
      "/reports/aging": () => jsonResponse({ rows: [] }),
      "/items": () => jsonResponse({ data: [], next_cursor: null }),
    });

    await renderDashboard(["report.inventory.view", "report.sales.view"]);

    expect(await screen.findByText("Inventory dashboard")).toBeInTheDocument();
    expect(screen.getByText("Sales dashboard")).toBeInTheDocument();
    expect(await screen.findByText("฿500.0000")).toBeInTheDocument();
  });

  it("masks the cost KPI without inventory.cost.view instead of fetching it", async () => {
    let costFetched = false;
    stubFetch({
      "/dashboards/cost": () => {
        costFetched = true;
        return panelsResponse([]);
      },
      "/reports/low-stock": () => jsonResponse({ rows: [] }),
      "/work-orders/timeline": () => jsonResponse({ data: [] }),
      "/reports/aging": () => jsonResponse({ rows: [] }),
      "/items": () => jsonResponse({ data: [], next_cursor: null }),
    });

    await renderDashboard(["report.cost.view"]);

    expect(await screen.findByText("Cost dashboard")).toBeInTheDocument();
    expect(screen.getByText("Restricted — requires cost access")).toBeInTheDocument();
    expect(costFetched).toBe(false);
  });

  it("shows the no-access message when the viewer holds no report permission", async () => {
    stubFetch({
      "/reports/low-stock": () => jsonResponse({ rows: [] }),
      "/work-orders/timeline": () => jsonResponse({ data: [] }),
      "/reports/aging": () => jsonResponse({ rows: [] }),
      "/items": () => jsonResponse({ data: [], next_cursor: null }),
    });

    await renderDashboard([]);

    expect(await screen.findByText("No report access yet — ask an admin to grant a reporting permission.")).toBeInTheDocument();
  });

  it("unifies low-stock, delayed-step, and overdue alerts into one panel", async () => {
    stubFetch({
      "/reports/low-stock": () => jsonResponse({ rows: [{ item_id: "i1", warehouse_id: "w1", on_hand: "1.0000", min_stock: "5.0000" }] }),
      "/work-orders/timeline": () => jsonResponse({ data: [] }),
      "/reports/aging": () =>
        jsonResponse({ rows: [{ customer_id: "c1", customer_name: "Acme Co.", current: "0", d1_30: "0", d31_60: "0", d61_90: "0", over_90: "999.0000" }] }),
      "/items": () => jsonResponse({ data: [{ id: "i1", code: "AA1", name: "Cotton Fabric", base_uom_id: "u1" }], next_cursor: null }),
    });

    await renderDashboard([]);

    expect(await screen.findByText("Cotton Fabric")).toBeInTheDocument();
    expect(screen.getByText("Acme Co.")).toBeInTheDocument();
  });
});
