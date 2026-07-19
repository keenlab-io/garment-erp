import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProductionRealtimeSync } from "./realtime";
import { productionKeys } from "./queries";

const { fakeClient } = vi.hoisted(() => {
  type Handler = (payload: unknown) => void;
  const listeners = new Map<string, Set<Handler>>();
  const fakeClient = {
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      const set = listeners.get(event) ?? new Set<Handler>();
      set.add(handler);
      listeners.set(event, set);
    }),
    off: vi.fn((event: string, handler?: Handler) => {
      if (!handler) {
        listeners.delete(event);
        return;
      }
      listeners.get(event)?.delete(handler);
    }),
    __trigger: (event: string, payload: unknown) => {
      for (const handler of listeners.get(event) ?? []) handler(payload);
    },
    __reset: () => listeners.clear(),
  };
  return { fakeClient };
});

vi.mock("../realtime/realtime-client.js", () => ({ realtimeClient: fakeClient }));

const step = {
  id: "step1",
  wo_id: "wo1",
  routing_step_id: "rs1",
  seq: 1,
  name: "Cut",
  status: "PENDING",
  standard_time_min: 30,
  started_at: null,
  finished_at: null,
  assigned_to: null,
  machine: null,
  is_delayed: false,
};

const timelineEntry = {
  id: "wo1",
  wo_no: "WO-0001",
  customer_id: null,
  due_date: null,
  status: "PENDING",
  steps: [step],
};

function seedCaches(queryClient: QueryClient) {
  queryClient.setQueryData(productionKeys.timeline({}), {
    status: 200,
    body: { data: [timelineEntry] },
    headers: new Headers(),
  });
  queryClient.setQueryData(productionKeys.workOrder("wo1"), {
    status: 200,
    body: {
      work_order: { id: "wo1", wo_no: "WO-0001" },
      steps: [step],
      defects: [],
    },
    headers: new Headers(),
  });
}

function Harness() {
  const { pulsingStepIds } = useProductionRealtimeSync("timeline");
  return <div>{pulsingStepIds.has("step1") ? "pulsing" : "idle"}</div>;
}

describe("useProductionRealtimeSync", () => {
  afterEach(() => {
    fakeClient.joinRoom.mockClear();
    fakeClient.leaveRoom.mockClear();
    fakeClient.on.mockClear();
    fakeClient.off.mockClear();
    fakeClient.__reset();
  });

  it("joins the given room on mount and leaves it on unmount", () => {
    const queryClient = new QueryClient();
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    expect(fakeClient.joinRoom).toHaveBeenCalledWith("timeline");

    unmount();
    expect(fakeClient.leaveRoom).toHaveBeenCalledWith("timeline");
  });

  it("merges a StepStarted broadcast into the timeline and work-order-detail caches", () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    act(() => {
      fakeClient.__trigger("StepStarted", {
        wo_id: "wo1",
        step_id: "step1",
        seq: 1,
        name: "Cut",
        status: "IN_PROGRESS",
      });
    });

    const timeline = queryClient.getQueryData(productionKeys.timeline({})) as {
      body: { data: (typeof timelineEntry)[] };
    };
    expect(timeline.body.data[0]?.steps[0]?.status).toBe("IN_PROGRESS");
    expect(timeline.body.data[0]?.steps[0]?.is_delayed).toBe(false);

    const detail = queryClient.getQueryData(productionKeys.workOrder("wo1")) as {
      body: { steps: (typeof step)[] };
    };
    expect(detail.body.steps[0]?.status).toBe("IN_PROGRESS");
  });

  it("applying the same event twice is idempotent", () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    const payload = { wo_id: "wo1", step_id: "step1", seq: 1, name: "Cut", status: "IN_PROGRESS" };
    act(() => {
      fakeClient.__trigger("StepStarted", payload);
      fakeClient.__trigger("StepStarted", payload);
    });

    const timeline = queryClient.getQueryData(productionKeys.timeline({})) as {
      body: { data: (typeof timelineEntry)[] };
    };
    expect(timeline.body.data[0]?.steps).toHaveLength(1);
    expect(timeline.body.data[0]?.steps[0]?.status).toBe("IN_PROGRESS");
  });

  it("StepDelayed flags is_delayed without changing status, and flags the step as pulsing", async () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    act(() => {
      fakeClient.__trigger("StepDelayed", {
        wo_id: "wo1",
        step_id: "step1",
        seq: 1,
        name: "Cut",
        status: "IN_PROGRESS",
      });
    });

    const timeline = queryClient.getQueryData(productionKeys.timeline({})) as {
      body: { data: (typeof timelineEntry)[] };
    };
    expect(timeline.body.data[0]?.steps[0]?.is_delayed).toBe(true);
    expect(timeline.body.data[0]?.steps[0]?.status).toBe("PENDING");

    expect(await screen.findByText("pulsing")).toBeInTheDocument();
  });

  it("ignores a malformed payload", () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    act(() => {
      fakeClient.__trigger("StepStarted", { not: "a step payload" });
    });

    const timeline = queryClient.getQueryData(productionKeys.timeline({})) as {
      body: { data: (typeof timelineEntry)[] };
    };
    expect(timeline.body.data[0]?.steps[0]?.status).toBe("PENDING");
  });
});
