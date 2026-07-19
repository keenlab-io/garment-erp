import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { ToastProvider, TooltipProvider } from "@erp/ui";
import i18n from "../i18n/i18n";
import { ThemeProvider } from "../theme/theme-context";
import { LocaleProvider } from "../i18n/locale-context";
import { DensityProvider } from "../density/density-context";
import { SessionProvider } from "../session/session-context";
import { superAdmin } from "../test/render";
import { AppChrome } from "./AppChrome";

/** Renders `AppChrome` with a leaf route carrying the given `kioskLockdown` static-data flag. */
async function renderAppChrome(kioskLockdown: boolean | undefined) {
  const rootRoute = createRootRoute({
    component: () => (
      <ThemeProvider>
        <LocaleProvider>
          <SessionProvider initialUser={superAdmin}>
            <DensityProvider>
              <TooltipProvider delayDuration={300}>
                <ToastProvider>
                  <AppChrome />
                </ToastProvider>
              </TooltipProvider>
            </DensityProvider>
          </SessionProvider>
        </LocaleProvider>
      </ThemeProvider>
    ),
  });
  const leafRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/production/scan",
    staticData: { kioskLockdown },
    component: () => <div>scan page content</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([leafRoute]),
    history: createMemoryHistory({ initialEntries: ["/production/scan"] }),
  });
  await router.load();
  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("AppChrome", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("suppresses the sidebar, tab bar, and drawer on a kioskLockdown route (design MD2 'no nav')", async () => {
    await renderAppChrome(true);
    expect(await screen.findByText("scan page content")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("shell:topbar.search") }),
    ).not.toBeInTheDocument();
  });

  it("renders the full nav chrome off a kioskLockdown route", async () => {
    await renderAppChrome(false);
    expect(await screen.findByText("scan page content")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
  });
});
