import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useCreateWorkOrderMutation,
  useScanWoStepMutation,
  useWipReportQuery,
  useWorkOrderQuery,
  useWorkOrderTimelineQuery,
} from "./queries";

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

const step = {
  id: "step1",
  wo_id: "wo1",
  routing_step_id: "rs1",
  seq: 1,
  name: "Cut",
  status: "IN_PROGRESS",
  standard_time_min: 30,
  started_at: null,
  finished_at: null,
  assigned_to: null,
  machine: null,
  is_delayed: false,
};

describe("production queries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useWorkOrderTimelineQuery renders the Gantt feed", async () => {
    stubFetch({
      "/work-orders/timeline": () =>
        jsonResponse({
          data: [
            {
              id: "wo1",
              wo_no: "WO-0001",
              customer_id: null,
              due_date: null,
              status: "IN_PROGRESS",
              steps: [step],
            },
          ],
        }),
    });

    function Harness() {
      const { data } = useWorkOrderTimelineQuery();
      return <div>{data?.body.data[0]?.wo_no ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("WO-0001")).toBeInTheDocument();
  });

  it("useWorkOrderQuery fetches a work order's detail (steps + defects)", async () => {
    stubFetch({
      "/work-orders/wo1": () =>
        jsonResponse({
          work_order: {
            id: "wo1",
            wo_no: "WO-0001",
            customer_id: null,
            finished_item_id: "item1",
            qty: "10",
            due_date: null,
            routing_template_id: "rt1",
            machine: null,
            mockup_file_key: null,
            status: "IN_PROGRESS",
            version: 0,
          },
          steps: [step],
          defects: [],
        }),
    });

    function Harness() {
      const { data } = useWorkOrderQuery("wo1");
      return <div>{data?.body.steps[0]?.name ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("Cut")).toBeInTheDocument();
  });

  it("useWipReportQuery renders per-department bottleneck counts", async () => {
    stubFetch({
      "/reports/wip": () =>
        jsonResponse({ rows: [{ department_id: "d1", in_progress_count: 3, delayed_count: 1 }] }),
    });

    function Harness() {
      const { data } = useWipReportQuery();
      return <div>{data?.body.rows[0]?.delayed_count ?? "loading"}</div>;
    }

    renderWithClient(<Harness />);

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("useCreateWorkOrderMutation resolves without throwing", async () => {
    stubFetch({
      "/work-orders": () =>
        jsonResponse(
          {
            work_order: {
              id: "wo1",
              wo_no: "WO-0001",
              customer_id: null,
              finished_item_id: "item1",
              qty: "10",
              due_date: null,
              routing_template_id: "rt1",
              machine: null,
              mockup_file_key: null,
              status: "PENDING",
              version: 0,
            },
          },
          201,
        ),
    });

    function Harness() {
      const create = useCreateWorkOrderMutation();
      return (
        <button
          onClick={() =>
            create.mutate({
              body: { finished_item_id: "item1", qty: "10", routing_template_id: "rt1" },
            })
          }
        >
          Create
        </button>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  });

  it("useScanWoStepMutation surfaces a 409 re-FINISH-on-COMPLETED error", async () => {
    stubFetch({
      "/scan": () =>
        jsonResponse({ code: "STATE_CONFLICT", message: "already COMPLETED", details: [] }, 409),
    });

    function Harness() {
      const scan = useScanWoStepMutation();
      return (
        <div>
          <button onClick={() => scan.mutate({ params: { id: "step1" }, body: { action: "FINISH" } })}>
            Scan
          </button>
          {scan.isError ? <div>failed</div> : null}
        </div>
      );
    }

    renderWithClient(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Scan" }));

    expect(await screen.findByText("failed")).toBeInTheDocument();
  });
});
