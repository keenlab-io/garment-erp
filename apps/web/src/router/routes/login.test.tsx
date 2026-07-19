import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
import i18n from "../../i18n/i18n";
import { SessionProvider } from "../../session/session-context";
import { clearTokens, getAccessToken } from "../../api/token-store";
import { LoginPage, validateLoginSearch } from "./login";

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

async function renderLogin(initialEntry = "/login") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rootRoute = createRootRoute({});
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginPage,
    validateSearch: validateLoginSearch,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([loginRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider initialUser={null}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("LoginPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
  });

  it("signs in and stores the token pair on valid credentials", async () => {
    stubFetch({
      "/auth/login": () =>
        jsonResponse({ access_token: "abc123", refresh_token: "refresh1", expires_in: 900 }),
      "/auth/me": () =>
        jsonResponse({
          user: {
            id: "u1",
            username: "alice",
            email: "alice@example.com",
            status: "ACTIVE",
            is_super_admin: false,
            employee_id: null,
          },
          roles: [],
          permissions: [],
        }),
    });

    await renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(getAccessToken()).toBe("abc123"));
  });

  it("shows an inline error on invalid credentials", async () => {
    stubFetch({
      "/auth/login": () =>
        jsonResponse({ code: "UNAUTHENTICATED", message: "bad credentials", details: [] }, 401),
    });

    await renderLogin();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Incorrect username or password.")).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("shows the re-auth notice banner from the search param", async () => {
    await renderLogin("/login?notice=reauth");
    expect(screen.getByText("Your access changed. Please sign in again.")).toBeInTheDocument();
  });
});
