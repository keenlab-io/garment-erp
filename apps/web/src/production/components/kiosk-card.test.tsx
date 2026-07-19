import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkOrderStep } from "@erp/contracts";
import { KioskCard, resolveKioskActions } from "./kiosk-card";

const PENDING_STEP: WorkOrderStep = {
  id: "step-1",
  wo_id: "wo-1",
  routing_step_id: "rs-1",
  seq: 3,
  name: "Sew",
  status: "PENDING",
  standard_time_min: 30,
  started_at: null,
  finished_at: null,
  assigned_to: null,
  machine: null,
  is_delayed: false,
};

describe("resolveKioskActions", () => {
  it("only START is valid before the step begins", () => {
    expect(resolveKioskActions("PENDING")).toEqual({ startEnabled: true, finishEnabled: false });
  });

  it("only FINISH is valid while running", () => {
    expect(resolveKioskActions("IN_PROGRESS")).toEqual({ startEnabled: false, finishEnabled: true });
  });

  it("neither is valid once completed, held, defective, or outsourced", () => {
    for (const status of ["COMPLETED", "HOLD", "DEFECT", "OUTSOURCED"] as const) {
      expect(resolveKioskActions(status)).toEqual({ startEnabled: false, finishEnabled: false });
    }
  });
});

describe("KioskCard", () => {
  it("renders the WO card details", () => {
    render(
      <KioskCard
        woNo="WO-114"
        customerLabel="TENGCO"
        itemLabel="Jersey"
        qty="200"
        step={PENDING_STEP}
        onStart={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    expect(screen.getByText("WO-114")).toBeInTheDocument();
    expect(screen.getByText(/TENGCO/)).toBeInTheDocument();
    expect(screen.getByText(/Jersey/)).toBeInTheDocument();
    expect(screen.getByText("Sew")).toBeInTheDocument();
    expect(screen.getByText(/Not started/)).toBeInTheDocument();
  });

  it("only enables START for a pending step, and calls onStart", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <KioskCard woNo="WO-114" itemLabel="Jersey" qty="200" step={PENDING_STEP} onStart={onStart} onFinish={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /START/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /FINISH/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /START/ }));
    expect(onStart).toHaveBeenCalled();
  });

  it("only enables FINISH for a running step, and calls onFinish", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const runningStep: WorkOrderStep = { ...PENDING_STEP, status: "IN_PROGRESS", started_at: "2026-07-19T08:00:00.000Z" };
    render(
      <KioskCard
        woNo="WO-114"
        itemLabel="Jersey"
        qty="200"
        step={runningStep}
        onStart={vi.fn()}
        onFinish={onFinish}
        now={new Date("2026-07-19T08:10:00.000Z")}
      />,
    );
    expect(screen.getByRole("button", { name: /START/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /FINISH/ })).toBeEnabled();
    expect(screen.getByText(/10 min/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /FINISH/ }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("hides the defect affordance without onReportDefect", () => {
    render(<KioskCard woNo="WO-114" itemLabel="Jersey" qty="200" step={PENDING_STEP} onStart={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.queryByText(/Report defect/)).not.toBeInTheDocument();
  });
});
