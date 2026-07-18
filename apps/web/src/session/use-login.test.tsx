import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "./session-context";
import { useLoginMutation } from "./use-login";
import { getAccessToken, clearTokens } from "../api/token-store";

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

function LoginHarness() {
  const { mutate, isError } = useLoginMutation();
  const { user } = useSession();
  return (
    <div>
      <div data-testid="user">{user ? user.email : "signed-out"}</div>
      <div data-testid="error">{isError ? "error" : "ok"}</div>
      <button onClick={() => mutate({ username: "alice", password: "correct-horse" })}>
        Sign in
      </button>
    </div>
  );
}

async function renderHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider initialUser={null}>
        <LoginHarness />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("useLoginMutation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
  });

  it("stores tokens and commits the real AuthUser from /auth/me on success", async () => {
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
          permissions: ["iam.user.manage"],
        }),
    });

    await renderHarness();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("alice@example.com"));
    expect(getAccessToken()).toBe("abc123");
  });

  it("leaves the session signed out on invalid credentials", async () => {
    stubFetch({
      "/auth/login": () =>
        jsonResponse({ code: "UNAUTHENTICATED", message: "bad credentials", details: [] }, 401),
    });

    await renderHarness();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("error"));
    expect(screen.getByTestId("user")).toHaveTextContent("signed-out");
    expect(getAccessToken()).toBeNull();
  });
});
