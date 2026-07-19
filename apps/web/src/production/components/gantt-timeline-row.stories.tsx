import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import type { WorkOrderTimelineEntry } from "@erp/contracts";
import { useDateFormat } from "../../i18n/use-formatters";
import { GanttTimelineRow, type GanttTimelineRowProps } from "./gantt-timeline-row";

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

/** Wires the row's `labels`/`formatDueDate` to the real `production` namespace + the app's
 * locale-aware date formatter so the Storybook toolbar's locale control retranslates it (M4 §5.3,
 * mirrors `stock-card-ledger.stories.tsx`'s wiring). */
function Demo(props: Partial<GanttTimelineRowProps> & { entry: WorkOrderTimelineEntry }) {
  const { t } = useTranslation("production");
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  return (
    <GanttTimelineRow
      customerLabel="ACME"
      {...props}
      formatDueDate={(iso) => dateFormat.format(new Date(iso))}
      labels={{ dueLabel: t("timeline.dueLabel"), emptySteps: t("timeline.emptySteps") }}
    />
  );
}

const meta = {
  title: "Production/GanttTimelineRow",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Demo entry={ENTRY} />,
};

export const Pulsing: Story = {
  render: () => <Demo entry={ENTRY} pulsingStepIds={new Set(["step-3"])} />,
};

export const NoSteps: Story = {
  render: () => <Demo entry={{ ...ENTRY, steps: [] }} />,
};
