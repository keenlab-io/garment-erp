import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkOrderTimelineEntry } from "@erp/contracts";
import { GanttTimelineRow } from "./gantt-timeline-row";

const ENTRY: WorkOrderTimelineEntry = {
  id: "wo-1",
  wo_no: "WO-114",
  customer_id: "cust-1",
  due_date: "2026-08-01",
  status: "IN_PROGRESS",
  steps: [
    {
      id: "step-1",
      wo_id: "wo-1",
      routing_step_id: "rs-1",
      seq: 1,
      name: "Layout",
      status: "COMPLETED",
      standard_time_min: 20,
      started_at: null,
      finished_at: null,
      assigned_to: null,
      machine: null,
      is_delayed: false,
    },
    {
      id: "step-2",
      wo_id: "wo-1",
      routing_step_id: "rs-2",
      seq: 2,
      name: "Sew",
      status: "IN_PROGRESS",
      standard_time_min: 40,
      started_at: "2026-07-19T08:00:00.000Z",
      finished_at: null,
      assigned_to: null,
      machine: null,
      is_delayed: true,
    },
  ],
};

describe("GanttTimelineRow", () => {
  it("renders the WO number and every step's label", () => {
    render(<GanttTimelineRow entry={ENTRY} />);
    expect(screen.getByText("WO-114")).toBeInTheDocument();
    expect(screen.getByText("Layout")).toBeInTheDocument();
    expect(screen.getByText("Sew")).toBeInTheDocument();
  });

  it("shows a delayed step as Delayed regardless of its raw status", () => {
    render(<GanttTimelineRow entry={ENTRY} />);
    expect(screen.getByText("Delayed")).toBeInTheDocument();
  });

  it("calls onStepClick with the clicked step and entry", async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(<GanttTimelineRow entry={ENTRY} onStepClick={onStepClick} />);
    await user.click(screen.getByRole("button", { name: "Layout" }));
    expect(onStepClick).toHaveBeenCalledWith(ENTRY.steps[0], ENTRY);
  });

  it("renders the empty-steps label when there are no steps", () => {
    render(<GanttTimelineRow entry={{ ...ENTRY, steps: [] }} />);
    expect(screen.getByText("No steps")).toBeInTheDocument();
  });

  it("renders the due date", () => {
    render(<GanttTimelineRow entry={ENTRY} formatDueDate={(iso) => `on ${iso}`} />);
    expect(screen.getByText(/on 2026-08-01/)).toBeInTheDocument();
  });
});
