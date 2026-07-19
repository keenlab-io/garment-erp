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
import { ToastProvider } from "@erp/ui";
import i18n from "../../../i18n/i18n";
import { LocaleProvider } from "../../../i18n/locale-context";
import { DensityProvider } from "../../../density/density-context";
import { UsersListPage } from "./users-list";

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

async function renderUsersList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <DensityProvider>
            <ToastProvider>
              <UsersListPage />
            </ToastProvider>
          </DensityProvider>
        </LocaleProvider>
      </QueryClientProvider>
    ),
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/users/$id",
    component: () => <div>user detail</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
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
  last_login_at: null,
};

describe("UsersListPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the users list with status and roles", async () => {
    stubFetch((url) => {
      if (url.includes("/users")) return jsonResponse({ data: [USER], next_cursor: null });
      if (url.includes("/roles")) return jsonResponse([]);
      return undefined;
    });

    await renderUsersList();

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("shows the empty state when there are no users", async () => {
    stubFetch((url) => {
      if (url.includes("/users")) return jsonResponse({ data: [], next_cursor: null });
      if (url.includes("/roles")) return jsonResponse([]);
      return undefined;
    });

    await renderUsersList();

    expect(await screen.findByText("No users yet.")).toBeInTheDocument();
  });

  it("creates a user from the drawer", async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    stubFetch((url, init) => {
      calls.push({ url, method: init?.method });
      if (url.includes("/users") && init?.method === "POST") {
        return jsonResponse({ user: USER }, 201);
      }
      if (url.includes("/users")) return jsonResponse({ data: [], next_cursor: null });
      if (url.includes("/roles")) return jsonResponse([{ id: "r1", name: "Admin", permission_count: 1, user_count: 0 }]);
      return undefined;
    });

    await renderUsersList();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Create user" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Username/), "bob");
    await user.type(dialog.getByLabelText(/^Email/), "bob@example.com");
    await user.type(dialog.getByLabelText(/^Temporary password/), "temp-pass-123");
    await user.click(dialog.getByRole("button", { name: "Create user" }));

    await waitFor(() =>
      expect(calls.some((c) => c.url.includes("/users") && c.method === "POST")).toBe(true),
    );
  });
});
