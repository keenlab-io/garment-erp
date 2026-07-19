import type { Meta, StoryObj } from "@storybook/react-vite";
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
      name: "Print",
      status: "IN_PROGRESS",
      standard_time_min: 30,
      started_at: null,
      finished_at: null,
      assigned_to: null,
      machine: null,
      is_delayed: false,
    },
    {
      id: "step-3",
      wo_id: "wo-1",
      routing_step_id: "rs-3",
      seq: 3,
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
      id: "step-4",
      wo_id: "wo-1",
      routing_step_id: "rs-4",
      seq: 4,
      name: "QC",
      status: "PENDING",
      standard_time_min: 15,
      started_at: null,
      finished_at: null,
      assigned_to: null,
      machine: null,
      is_delayed: false,
    },
  ],
};

const meta = {
  title: "Production/GanttTimelineRow",
  component: GanttTimelineRow,
  args: { entry: ENTRY, customerLabel: "ACME" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof GanttTimelineRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pulsing: Story = {
  args: { pulsingStepIds: new Set(["step-3"]) },
};

export const NoSteps: Story = {
  args: { entry: { ...ENTRY, steps: [] } },
};
