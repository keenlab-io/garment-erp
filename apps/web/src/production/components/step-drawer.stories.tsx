import type { Meta, StoryObj } from "@storybook/react-vite";
import { asQty, type Defect, type WorkOrderStep } from "@erp/contracts";
import { StepDrawer } from "./step-drawer";

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
  assigned_to: "emp-1",
  machine: "M-04",
  is_delayed: true,
};

const DEFECTS: Defect[] = [{ id: "d-1", wo_step_id: "step-1", type: "Misprint", qty: asQty("2"), note: null }];

const meta = {
  title: "Production/StepDrawer",
  component: StepDrawer,
  args: {
    open: true,
    onOpenChange: () => {},
    woNo: "WO-114",
    step: STEP,
    defects: DEFECTS,
    onHold: () => {},
    onSubcontract: () => {},
    now: new Date("2026-07-19T08:45:00.000Z"),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StepDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Delayed: Story = {
  args: { assignedToLabel: "Somchai P.", onReassign: () => {} },
};

export const NoDefects: Story = {
  args: { defects: [] },
};
