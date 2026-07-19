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
import { RoleDetailPage } from "./role-detail";

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

const ROLE = {
  id: "r1",
  name: "Line Supervisor",
  description: "Floor supervision",
  is_system: false,
  cloned_from: null,
  permission_codes: ["iam.user.manage"],
};
const SUMMARY = { id: "r1", name: "Line Supervisor", permission_count: 1, user_count: 3 };

async function renderRoleDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rootRoute = createRootRoute({});
  const rolesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/roles", component: () => <div>roles list</div> });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/roles/$id",
    component: () => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <PermissionsProvider permissions={["iam.role.manage"]} isSuperAdmin={false}>
            <RoleDetailPage />
          </PermissionsProvider>
        </ToastProvider>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([rolesRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/admin/roles/r1"] }),
  });
  await router.load();
  return render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe("RoleDetailPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the role's name and permission matrix", async () => {
    stubFetch((url) => {
      if (url.includes("/roles/r1")) return jsonResponse({ role: ROLE });
      if (url.includes("/roles")) return jsonResponse([SUMMARY]);
      return undefined;
    });

    await renderRoleDetail();

    expect(await screen.findByText("Line Supervisor")).toBeInTheDocument();
    expect(screen.getByText("Floor supervision")).toBeInTheDocument();
  });

  it("saves permission changes through the confirm dialog", async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      if (url.includes("/roles/r1") && init?.method === "PUT") {
        calls.push("update");
        return jsonResponse({ role: { ...ROLE, permission_codes: ["iam.user.manage", "iam.user.force_logout"] } });
      }
      if (url.includes("/roles/r1")) return jsonResponse({ role: ROLE });
      if (url.includes("/roles")) return jsonResponse([SUMMARY]);
      return undefined;
    });

    await renderRoleDetail();
    const user = userEvent.setup();

    await screen.findByText("Line Supervisor");
    const editCheckbox = screen.getByRole("checkbox", { name: "iam.user.force_logout" });
    await user.click(editCheckbox);

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(calls).toContain("update"));
  });
});
