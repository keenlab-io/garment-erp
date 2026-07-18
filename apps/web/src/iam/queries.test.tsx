import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useUsersQuery,
  useRolesQuery,
  useAuditQuery,
  useCreateRoleMutation,
  useForceLogoutMutation,
} from "./queries";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(byPath: Record<string, () => Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      const match = Object.entries(byPath).find(([path]) => url.includes(path));
      return Promise.resolve(match ? match[1]() : jsonResponse({}, 404));
    }),
  );
  return calls;
}

function renderWithClient(ui: React.ReactNode, queryClient = new QueryClient()) {
  return { queryClient, ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>) };
}

describe("iam queries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useUsersQuery lists users from the paginated endpoint", async () => {
    stubFetch({
      "/users": () =>
        jsonResponse({
          data: [
            {
              id: "u1",
              username: "alice",
              email: "alice@example.com",
              status: "ACTIVE",
              is_super_admin: false,
              employee_id: null,
              roles: [],
              last_login_at: null,
            },
          ],
          next_cursor: null,
        }),
    });

    function Harness() {
      const { data } = useUsersQuery();
      return <div>{data?.body.data.map((u) => u.username).join(",") ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("alice")).toBeInTheDocument();
  });

  it("useRolesQuery lists role summaries", async () => {
    stubFetch({
      "/roles": () =>
        jsonResponse([{ id: "r1", name: "Admin", permission_count: 3, user_count: 2 }]),
    });

    function Harness() {
      const { data } = useRolesQuery();
      return <div>{data?.body.map((r) => r.name).join(",") ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("Admin")).toBeInTheDocument();
  });

  it("useAuditQuery lists audit entries", async () => {
    stubFetch({
      "/audit": () =>
        jsonResponse({
          data: [
            {
              id: "a1",
              at: new Date().toISOString(),
              actor_user_id: "u1",
              actor_role: "Admin",
              action: "UPDATE",
              entity_type: "role",
              entity_id: "r1",
              before: null,
              after: null,
              reason: null,
            },
          ],
          next_cursor: null,
        }),
    });

    function Harness() {
      const { data } = useAuditQuery();
      return <div>{data?.body.data.map((a) => a.action).join(",") ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("UPDATE")).toBeInTheDocument();
  });

  it("useCreateRoleMutation invalidates the roles list on success", async () => {
    let listCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? "GET";
        if (url.includes("/roles") && method === "GET") {
          listCalls += 1;
          return Promise.resolve(
            jsonResponse([{ id: "r1", name: "Admin", permission_count: 1, user_count: 0 }]),
          );
        }
        if (url.includes("/roles") && method === "POST") {
          return Promise.resolve(
            jsonResponse(
              { role: { id: "r2", name: "New role", description: null, is_system: false, cloned_from: null, permission_codes: [] } },
              201,
            ),
          );
        }
        return Promise.resolve(jsonResponse({}, 404));
      }),
    );

    function Harness() {
      const { data } = useRolesQuery();
      const create = useCreateRoleMutation();
      return (
        <div>
          <div data-testid="count">{data?.body.length ?? 0}</div>
          <button
            onClick={() => create.mutate({ body: { name: "New role", permission_codes: [] } })}
          >
            Create
          </button>
        </div>
      );
    }

    renderWithClient(<Harness />);
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));

    const callsBefore = listCalls;
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore));
  });

  it("useForceLogoutMutation resolves without throwing", async () => {
    stubFetch({
      "/force-logout": () => new Response(null, { status: 204 }),
    });

    function Harness() {
      const forceLogout = useForceLogoutMutation();
      return (
        <button onClick={() => forceLogout.mutate({ params: { id: "u1" }, body: undefined })}>
          Revoke
        </button>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });
});
