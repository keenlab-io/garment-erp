import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkOrderTimelineEntry } from "@erp/contracts";
import { AlertRail, deriveDelayedStepAlerts } from "./alert-rail";

const ENTRIES: WorkOrderTimelineEntry[] = [
  {
    id: "wo-1",
    wo_no: "WO-114",
    customer_id: null,
    due_date: null,
    status: "IN_PROGRESS",
    steps: [
      {
        id: "step-1",
        wo_id: "wo-1",
        routing_step_id: "rs-1",
        seq: 1,
        name: "Sew",
        status: "IN_PROGRESS",
        standard_time_min: 40,
        started_at: null,
        finished_at: null,
        assigned_to: null,
        machine: null,
        is_delayed: true,
      },
      {
        id: "step-2",
        wo_id: "wo-1",
        routing_step_id: "rs-2",
        seq: 2,
        name: "QC",
        status: "PENDING",
        standard_time_min: 10,
        started_at: null,
        finished_at: null,
        assigned_to: null,
        machine: null,
        is_delayed: false,
      },
    ],
  },
];

describe("deriveDelayedStepAlerts", () => {
  it("emits one alert per delayed step, titled by WO number and step name", () => {
    const alerts = deriveDelayedStepAlerts(ENTRIES);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "step-1", title: "WO-114 · Sew", chipStatus: "delayed" });
  });
});

describe("AlertRail", () => {
  it("renders the empty state when there are no alerts", () => {
    render(<AlertRail alerts={[]} />);
    expect(screen.getByText("No active alerts")).toBeInTheDocument();
  });

  it("renders each alert's title, detail, and count", () => {
    render(<AlertRail alerts={deriveDelayedStepAlerts(ENTRIES)} />);
    expect(screen.getByText("Alerts (1)")).toBeInTheDocument();
    expect(screen.getByText("WO-114 · Sew")).toBeInTheDocument();
  });

  it("invokes an alert's onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const alerts = deriveDelayedStepAlerts(ENTRIES).map((a) => ({ ...a, onClick }));
    render(<AlertRail alerts={alerts} />);
    await user.click(screen.getByRole("button", { name: /WO-114/ }));
    expect(onClick).toHaveBeenCalled();
  });
});
