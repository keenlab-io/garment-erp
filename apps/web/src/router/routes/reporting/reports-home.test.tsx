import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { PermissionsProvider } from "@erp/ui";
import type { Permission } from "@erp/contracts";
import i18n from "../../../i18n/i18n";
import { ReportsHomePage } from "./reports-home";

async function renderHome(permissions: Permission[]) {
  const rootRoute = createRootRoute({
    component: () => (
      <PermissionsProvider permissions={permissions} isSuperAdmin={false}>
        <Outlet />
      </PermissionsProvider>
    ),
  });
  const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reports", component: ReportsHomePage });
  const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reports/dashboards/$group", component: () => null });
  const reportRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reports/$reportKey", component: () => null });
  const schedulesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reports/schedules", component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, dashboardRoute, reportRoute, schedulesRoute]),
    history: createMemoryHistory({ initialEntries: ["/reports"] }),
  });
  await router.load();
  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("ReportsHomePage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("lists only the dashboards and catalog groups the viewer can access", async () => {
    await renderHome(["report.inventory.view"]);

    expect(await screen.findByRole("link", { name: "Inventory dashboard" })).toBeInTheDocument();
    expect(screen.queryByText("Sales dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("Stock balance")).toBeInTheDocument();
    expect(screen.queryByText("Sales overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Report schedules")).not.toBeInTheDocument();
  });

  it("hides cost/profit report keys without inventory.cost.view even when report.cost.view is held", async () => {
    await renderHome(["report.cost.view"]);

    expect(screen.queryByText("Monthly COGS")).not.toBeInTheDocument();
  });

  it("shows the cost catalog once inventory.cost.view is also held", async () => {
    await renderHome(["report.cost.view", "inventory.cost.view"]);

    expect(await screen.findByText("Monthly COGS")).toBeInTheDocument();
  });

  it("links to schedules only with report.schedule.manage", async () => {
    await renderHome(["report.schedule.manage"]);

    expect(await screen.findByText("Report schedules")).toBeInTheDocument();
  });
});
