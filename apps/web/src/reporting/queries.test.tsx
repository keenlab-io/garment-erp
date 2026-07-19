import { afterEach, describe, expect, it, vi } from "vitest";
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
import {
  exportPollInterval,
  useCreateReportScheduleMutation,
  useDashboardFilter,
  useDashboardQuery,
  useExportStatusQuery,
  useReportFilter,
  useReportQuery,
  useReportSchedulesQuery,
} from "./queries";
import { validateDashboardSearch, validateReportSearch } from "./search";

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

function renderWithClient(ui: React.ReactNode, queryClient = new QueryClient()) {
  return { queryClient, ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>) };
}

/** A minimal one-route memory router so `useSearch`/`useNavigate` resolve for the filter hooks. */
async function renderAtPath(
  ui: React.ReactNode,
  { path, initialEntry, validateSearch }: { path: string; initialEntry: string; validateSearch: (s: Record<string, unknown>) => unknown },
) {
  const queryClient = new QueryClient();
  const rootRoute = createRootRoute({});
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <>{ui}</>,
    validateSearch,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

describe("reporting queries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useReportQuery reads the tabular report result", async () => {
    stubFetch({
      "/reports/stock.balance": () =>
        jsonResponse({
          columns: [{ key: "sku", label: "SKU" }],
          rows: [{ sku: "A1" }],
          totals: {},
        }),
    });

    function Harness() {
      const { data } = useReportQuery("stock.balance");
      return <div>{data?.body.rows[0]?.sku ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("A1")).toBeInTheDocument();
  });

  it("useReportQuery stays disabled for an empty report key", () => {
    stubFetch({});

    function Harness() {
      const { fetchStatus } = useReportQuery("");
      return <div>{fetchStatus}</div>;
    }

    renderWithClient(<Harness />);
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("useDashboardQuery reads dashboard panels", async () => {
    stubFetch({
      "/dashboards/overview": () =>
        jsonResponse({ panels: [{ key: "kpi.revenue", data: { value: "1000.00" } }] }),
    });

    function Harness() {
      const { data } = useDashboardQuery("overview");
      return <div>{data?.body.panels[0]?.key ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("kpi.revenue")).toBeInTheDocument();
  });

  it("useReportSchedulesQuery lists schedules", async () => {
    stubFetch({
      "/report-schedules": () =>
        jsonResponse({
          data: [
            {
              id: "s1",
              name: "Weekly digest",
              report_key: "sales.overview",
              cron: "0 8 * * 1",
              recipients: ["owner@example.com"],
              format: "PDF",
              params: {},
              is_active: true,
              version: 0,
            },
          ],
          next_cursor: null,
        }),
    });

    function Harness() {
      const { data } = useReportSchedulesQuery();
      return <div>{data?.body.data[0]?.name ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("Weekly digest")).toBeInTheDocument();
  });

  it("useCreateReportScheduleMutation invalidates the schedules list", async () => {
    let listCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? "GET";
        if (url.includes("/report-schedules") && method === "GET") {
          listCalls += 1;
          return Promise.resolve(jsonResponse({ data: [], next_cursor: null }));
        }
        if (url.includes("/report-schedules") && method === "POST") {
          return Promise.resolve(
            jsonResponse(
              {
                schedule: {
                  id: "s2",
                  name: "New digest",
                  report_key: "sales.overview",
                  cron: "0 8 * * 1",
                  recipients: ["owner@example.com"],
                  format: "PDF",
                  params: {},
                  is_active: true,
                  version: 0,
                },
              },
              201,
            ),
          );
        }
        return Promise.resolve(jsonResponse({}, 404));
      }),
    );

    function Harness() {
      const { data } = useReportSchedulesQuery();
      const create = useCreateReportScheduleMutation();
      return (
        <div>
          <div data-testid="count">{data?.body.data.length ?? 0}</div>
          <button
            onClick={() =>
              create.mutate({
                body: {
                  name: "New digest",
                  report_key: "sales.overview",
                  cron: "0 8 * * 1",
                  recipients: ["owner@example.com"],
                  format: "PDF",
                  params: {},
                  is_active: true,
                },
              })
            }
          >
            Create
          </button>
        </div>
      );
    }

    renderWithClient(<Harness />);
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("0"));

    const callsBefore = listCalls;
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore));
  });

  describe("exportPollInterval", () => {
    it("polls while PENDING", () => {
      expect(exportPollInterval({ status: 200, body: { status: "PENDING" } })).toBe(2000);
    });

    it("polls while RUNNING", () => {
      expect(exportPollInterval({ status: 200, body: { status: "RUNNING" } })).toBe(2000);
    });

    it("stops once DONE", () => {
      expect(exportPollInterval({ status: 200, body: { status: "DONE" } })).toBe(false);
    });

    it("stops on FAILED", () => {
      expect(exportPollInterval({ status: 200, body: { status: "FAILED" } })).toBe(false);
    });

    it("stops when there's no data yet", () => {
      expect(exportPollInterval(undefined)).toBe(false);
    });
  });

  it("useExportStatusQuery surfaces the signed URL once the job is DONE", async () => {
    stubFetch({
      "/exports/job1": () => jsonResponse({ status: "DONE", file_url: "https://storage.example/report.pdf" }),
    });

    function Harness() {
      const { data } = useExportStatusQuery("job1");
      return <div>{data?.body.file_url ?? "pending"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("https://storage.example/report.pdf")).toBeInTheDocument();
  });

  it("useDashboardFilter reads the (dimension, value) search params and writes new ones", async () => {
    function Harness() {
      const { filter, setFilter, clearFilter } = useDashboardFilter("/");
      return (
        <div>
          <div data-testid="filter">{JSON.stringify(filter)}</div>
          <button onClick={() => setFilter({ dimension: "month", value: "2026-07" })}>Set</button>
          <button onClick={() => clearFilter()}>Clear</button>
        </div>
      );
    }

    await renderAtPath(<Harness />, {
      path: "/",
      initialEntry: "/?dimension=product&value=shirt",
      validateSearch: validateDashboardSearch,
    });

    expect(screen.getByTestId("filter")).toHaveTextContent(
      JSON.stringify({ dimension: "product", value: "shirt" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Set" }));
    await waitFor(() =>
      expect(screen.getByTestId("filter")).toHaveTextContent(
        JSON.stringify({ dimension: "month", value: "2026-07" }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(screen.getByTestId("filter")).toHaveTextContent("{}"));
  });

  it("useReportFilter reads report-specific filter keys alongside from/to", async () => {
    function Harness() {
      const { filter, setFilter } = useReportFilter();
      return (
        <div>
          <div data-testid="filter">{JSON.stringify(filter)}</div>
          <button onClick={() => setFilter({ from: "2026-01-01", customer_id: "c1" })}>Set</button>
        </div>
      );
    }

    await renderAtPath(<Harness />, {
      path: "/reports/$reportKey",
      initialEntry: "/reports/sales.overview?from=2026-01-01&to=2026-07-01",
      validateSearch: validateReportSearch,
    });

    expect(screen.getByTestId("filter")).toHaveTextContent(
      JSON.stringify({ from: "2026-01-01", to: "2026-07-01" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Set" }));
    await waitFor(() =>
      expect(screen.getByTestId("filter")).toHaveTextContent(
        JSON.stringify({ from: "2026-01-01", customer_id: "c1" }),
      ),
    );
  });
});
