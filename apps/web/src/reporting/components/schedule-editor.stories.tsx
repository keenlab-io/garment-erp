import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { ReportExportFormat } from "@erp/contracts";
import { ScheduleEditor, type ScheduleEditorValue } from "./schedule-editor";
import { useCadenceLabel, useWeekdayLabel } from "../use-cadence-label";

const REPORT_OPTIONS = [
  { key: "sales.overview", label: "Sales overview" },
  { key: "stock.balance", label: "Stock balance" },
];

/** Wires the editor's `labels` to the real `reporting` namespace (weekday/cadence via the shared
 * `use-cadence-label` hooks) so the Storybook toolbar's locale control retranslates it, including
 * the friendly cadence preview (M6 §5.1, §5.3). */
function Harness({ initial }: { initial: ScheduleEditorValue }) {
  const { t } = useTranslation("reporting");
  const weekdayLabel = useWeekdayLabel();
  const describeCadence = useCadenceLabel();
  const [value, setValue] = React.useState(initial);
  return (
    <ScheduleEditor
      value={value}
      onChange={setValue}
      reportOptions={REPORT_OPTIONS}
      onSubmit={() => {}}
      onRunNow={() => {}}
      labels={{
        nameLabel: t("scheduleEditor.nameLabel"),
        reportLabel: t("scheduleEditor.reportLabel"),
        frequencyLabel: t("scheduleEditor.frequencyLabel"),
        daily: t("scheduleEditor.daily"),
        weekly: t("scheduleEditor.weekly"),
        dayOfWeekLabel: t("scheduleEditor.dayOfWeekLabel"),
        weekdayLabel,
        timeLabel: t("scheduleEditor.timeLabel"),
        recipientsLabel: t("scheduleEditor.recipientsLabel"),
        recipientPlaceholder: t("scheduleEditor.recipientPlaceholder"),
        addRecipient: t("scheduleEditor.addRecipient"),
        removeRecipient: (email) => t("scheduleEditor.removeRecipient", { email }),
        formatLabel: t("scheduleEditor.formatLabel"),
        activeLabel: t("schedules.active"),
        describeCadence,
        preview: (text) => t("scheduleEditor.preview", { text }),
        save: t("scheduleEditor.save"),
        runNow: t("schedules.runNow"),
      }}
    />
  );
}

const meta = {
  title: "Reporting/ScheduleEditor",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Weekly: Story = {
  render: () => (
    <Harness
      initial={{
        name: "Monday sales digest",
        reportKey: "sales.overview",
        cadence: { frequency: "weekly", dayOfWeek: 1, time: "08:00" },
        recipients: ["owner@example.com"],
        format: ReportExportFormat.PDF,
        isActive: true,
      }}
    />
  ),
};

export const Daily: Story = {
  render: () => (
    <Harness
      initial={{
        name: "Daily stock digest",
        reportKey: "stock.balance",
        cadence: { frequency: "daily", time: "07:00" },
        recipients: [],
        format: ReportExportFormat.EXCEL,
        isActive: true,
      }}
    />
  ),
};
