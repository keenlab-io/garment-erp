import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
import { RolesListPage } from "./roles-list";

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

const ROLE = { id: "r1", name: "Line Supervisor", permission_count: 4, user_count: 3 };

async function renderRolesList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <PermissionsProvider permissions={["iam.role.manage"]} isSuperAdmin={false}>
            <RolesListPage />
          </PermissionsProvider>
        </ToastProvider>
      </QueryClientProvider>
    ),
  });
  const detailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/roles/$id", component: () => <div>role detail</div> });
  const usersRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/users", component: () => <div>users list</div> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([detailRoute, usersRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("RolesListPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the roles list", async () => {
    stubFetch((url) => {
      if (url.includes("/roles")) return jsonResponse([ROLE]);
      return undefined;
    });

    await renderRolesList();

    expect(await screen.findByText("Line Supervisor")).toBeInTheDocument();
  });

  it("shows an inline blocker with a link to Users when delete hits a 409", async () => {
    stubFetch((url, init) => {
      if (url.includes("/roles/r1") && init?.method === "DELETE") {
        return jsonResponse(
          { code: "STATE_CONFLICT", message: "Role is still assigned to users", details: [] },
          409,
        );
      }
      if (url.includes("/roles")) return jsonResponse([ROLE]);
      return undefined;
    });

    await renderRolesList();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Row actions" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText(/^Super-Admin password/i), "pw");
    await user.click(dialog.getByRole("button", { name: "Delete role" }));

    expect(await screen.findByText("3 user(s) still use this role — reassign them from Users, then delete again.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Users" })).toBeInTheDocument();
  });
});
