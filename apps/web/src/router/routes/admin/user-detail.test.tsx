import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { PermissionsProvider, ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { LocaleProvider } from "../../../i18n/locale-context";
import { UserDetailPage } from "./user-detail";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

const USER = {
  id: "u1",
  username: "alice",
  email: "alice@example.com",
  status: "ACTIVE",
  is_super_admin: false,
  employee_id: null,
  roles: [{ id: "r1", name: "Admin" }],
  last_login_at: "2026-07-01T00:00:00.000Z",
};

async function renderUserDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rootRoute = createRootRoute({});
  const listRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/users", component: () => <div>users list</div> });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/users/$id",
    component: () => (
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <ToastProvider>
            <PermissionsProvider permissions={["iam.user.force_logout"]} isSuperAdmin={false}>
              <UserDetailPage />
            </PermissionsProvider>
          </ToastProvider>
        </LocaleProvider>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/admin/users/u1"] }),
  });
  await router.load();
  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("UserDetailPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the user's identity, roles, and status", async () => {
    stubFetch((url) => {
      if (url.includes("/users/u1")) return jsonResponse({ user: USER });
      if (url.includes("/roles")) return jsonResponse([{ id: "r1", name: "Admin", permission_count: 1, user_count: 1 }]);
      if (url.includes("/audit")) return jsonResponse({ data: [], next_cursor: null });
      return undefined;
    });

    await renderUserDetail();

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("opens the guarded force-logout dialog and confirms", async () => {
    stubFetch((url) => {
      if (url.includes("/force-logout")) return new Response(null, { status: 204 });
      if (url.includes("/users/u1")) return jsonResponse({ user: USER });
      if (url.includes("/roles")) return jsonResponse([{ id: "r1", name: "Admin", permission_count: 1, user_count: 1 }]);
      if (url.includes("/audit")) return jsonResponse({ data: [], next_cursor: null });
      return undefined;
    });

    await renderUserDetail();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Force logout" }));
    expect(await screen.findByText("Force logout alice?")).toBeInTheDocument();

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Super-Admin password/i), "super-admin-password");
    await user.click(dialog.getByRole("button", { name: "Force logout" }));

    await waitFor(() => expect(screen.queryByText("Force logout alice?")).not.toBeInTheDocument());
  });
});
