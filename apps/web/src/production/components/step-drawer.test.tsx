import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { asQty, type Defect, type WorkOrderStep } from "@erp/contracts";
import { StepDrawer, computeStepTiming } from "./step-drawer";

const STEP: WorkOrderStep = {
  id: "step-1",
  wo_id: "wo-1",
  routing_step_id: "rs-1",
  seq: 2,
  name: "Sew",
  status: "IN_PROGRESS",
  standard_time_min: 30,
  started_at: "2026-07-19T08:00:00.000Z",
  finished_at: null,
  assigned_to: null,
  machine: "M-04",
  is_delayed: true,
};

const DEFECTS: Defect[] = [{ id: "d-1", wo_step_id: "step-1", type: "Misprint", qty: asQty("2"), note: null }];

describe("computeStepTiming", () => {
  it("is not-started when the step hasn't started", () => {
    const timing = computeStepTiming({ started_at: null, finished_at: null, standard_time_min: 30 });
    expect(timing.elapsedMin).toBeNull();
    expect(timing.overStandard).toBe(false);
  });

  it("computes elapsed to now for a running step and flags over-standard", () => {
    const now = new Date("2026-07-19T08:45:00.000Z");
    const timing = computeStepTiming(
      { started_at: "2026-07-19T08:00:00.000Z", finished_at: null, standard_time_min: 30 },
      now,
    );
    expect(timing.elapsedMin).toBe(45);
    expect(timing.overStandard).toBe(true);
  });

  it("computes elapsed to finished_at for a completed step", () => {
    const timing = computeStepTiming({
      started_at: "2026-07-19T08:00:00.000Z",
      finished_at: "2026-07-19T08:20:00.000Z",
      standard_time_min: 30,
    });
    expect(timing.elapsedMin).toBe(20);
    expect(timing.overStandard).toBe(false);
  });
});

describe("StepDrawer", () => {
  it("renders assigned/machine/elapsed vs standard and the defect log", () => {
    render(
      <StepDrawer
        open
        onOpenChange={() => {}}
        woNo="WO-114"
        step={STEP}
        defects={DEFECTS}
        onHold={vi.fn()}
        onSubcontract={vi.fn()}
        now={new Date("2026-07-19T08:45:00.000Z")}
      />,
    );
    expect(screen.getByText("WO-114")).toBeInTheDocument();
    expect(screen.getByText("M-04")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("Misprint")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("submits a hold with the typed reason", async () => {
    const user = userEvent.setup();
    const onHold = vi.fn();
    render(
      <StepDrawer open onOpenChange={() => {}} woNo="WO-114" step={STEP} defects={[]} onHold={onHold} onSubcontract={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Hold" }));
    await user.type(screen.getByLabelText(/reason/i), "Machine jam");
    await user.click(screen.getByRole("button", { name: "Hold" }));
    expect(onHold).toHaveBeenCalledWith("Machine jam");
  });

  it("submits a subcontract with vendor and ISO sla_due", async () => {
    const user = userEvent.setup();
    const onSubcontract = vi.fn();
    render(
      <StepDrawer
        open
        onOpenChange={() => {}}
        woNo="WO-114"
        step={STEP}
        defects={[]}
        onHold={vi.fn()}
        onSubcontract={onSubcontract}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Subcontract" }));
    await user.type(screen.getByLabelText(/^Vendor/), "Acme Embroidery");
    const slaInput = screen.getByLabelText(/^SLA due/);
    await user.clear(slaInput);
    await user.type(slaInput, "2026-08-01T10:00");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubcontract).toHaveBeenCalledWith("Acme Embroidery", new Date("2026-08-01T10:00").toISOString());
  });

  it("hides the reassign control without an onReassign handler", () => {
    render(
      <StepDrawer open onOpenChange={() => {}} woNo="WO-114" step={STEP} defects={[]} onHold={vi.fn()} onSubcontract={vi.fn()} />,
    );
    expect(screen.queryByText("Reassign")).not.toBeInTheDocument();
  });

  it("calls onReassign with the typed employee id", async () => {
    const user = userEvent.setup();
    const onReassign = vi.fn();
    render(
      <StepDrawer
        open
        onOpenChange={() => {}}
        woNo="WO-114"
        step={STEP}
        defects={[]}
        onHold={vi.fn()}
        onSubcontract={vi.fn()}
        onReassign={onReassign}
      />,
    );
    await user.type(screen.getByLabelText(/Assigned to/), "emp-42");
    await user.click(screen.getByRole("button", { name: "Reassign" }));
    expect(onReassign).toHaveBeenCalledWith("emp-42");
  });
});
