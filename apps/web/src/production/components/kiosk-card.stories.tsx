import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import type { WorkOrderStep } from "@erp/contracts";
import { KioskCard, type KioskCardProps } from "./kiosk-card";

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

/** Wires the card's `labels` to the real `production` namespace so the Storybook toolbar's locale
 * control retranslates it (M4 §5.3, mirrors `stock-card-ledger.stories.tsx`'s wiring). */
function Demo(props: Partial<KioskCardProps> & Pick<KioskCardProps, "step">) {
  const { t } = useTranslation("production");
  return (
    <KioskCard
      woNo="WO-114"
      customerLabel="TENGCO"
      itemLabel="Jersey"
      qty="200"
      onStart={() => {}}
      onFinish={() => {}}
      {...props}
      labels={{
        elapsed: t("scanStation.elapsed"),
        notStarted: t("scanStation.notStarted"),
        minutes: t("scanStation.minutes"),
        start: t("scanStation.start"),
        finish: t("scanStation.finish"),
        reportDefect: t("scanStation.reportDefect"),
      }}
    />
  );
}

const meta = {
  title: "Production/KioskCard",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToStart: Story = {
  render: () => <Demo step={PENDING_STEP} />,
};

export const Running: Story = {
  render: () => (
    <Demo
      step={{ ...PENDING_STEP, status: "IN_PROGRESS", started_at: "2026-07-19T08:00:00.000Z" }}
      now={new Date("2026-07-19T08:10:00.000Z")}
      onReportDefect={() => {}}
    />
  ),
};

export const Delayed: Story = {
  render: () => (
    <Demo
      step={{ ...PENDING_STEP, status: "IN_PROGRESS", started_at: "2026-07-19T08:00:00.000Z", is_delayed: true }}
      now={new Date("2026-07-19T09:00:00.000Z")}
      onReportDefect={() => {}}
    />
  ),
};
