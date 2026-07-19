import type { Meta, StoryObj } from "@storybook/react-vite";
import type { WorkOrderStep } from "@erp/contracts";
import { KioskCard } from "./kiosk-card";

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

const meta = {
  title: "Production/KioskCard",
  component: KioskCard,
  args: {
    woNo: "WO-114",
    customerLabel: "TENGCO",
    itemLabel: "Jersey",
    qty: "200",
    onStart: () => {},
    onFinish: () => {},
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof KioskCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToStart: Story = {
  args: { step: PENDING_STEP },
};

export const Running: Story = {
  args: {
    step: { ...PENDING_STEP, status: "IN_PROGRESS", started_at: "2026-07-19T08:00:00.000Z" },
    now: new Date("2026-07-19T08:10:00.000Z"),
    onReportDefect: () => {},
  },
};

export const Delayed: Story = {
  args: {
    step: { ...PENDING_STEP, status: "IN_PROGRESS", started_at: "2026-07-19T08:00:00.000Z", is_delayed: true },
    now: new Date("2026-07-19T09:00:00.000Z"),
    onReportDefect: () => {},
  },
};
