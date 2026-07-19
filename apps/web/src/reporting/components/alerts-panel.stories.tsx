import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { AlertsPanel, type ReportingAlert } from "./alerts-panel";

const ALERTS: ReportingAlert[] = [
  {
    id: "1",
    source: "stock",
    status: "stock-near-min",
    title: "Cotton fabric",
    description: "12 / 50 m",
    href: "#",
  },
  {
    id: "2",
    source: "production",
    status: "delayed",
    title: "WO-1042 · Cutting",
    description: "120m standard",
    href: "#",
  },
  {
    id: "3",
    source: "finance",
    status: "overdue",
    title: "Acme Co.",
    description: "12,500.00",
    href: "#",
  },
];

/** Wires the panel's `labels` to the real `reporting` namespace so the Storybook toolbar's locale
 * control retranslates it (M6 §5.3) — the unified stock/production/finance alerts (design MD3)
 * each carry an `InkChip` (glyph + swatch + label, never color-alone) plus a per-alert accessible
 * View action (M6 §5.2). */
function useAlertsLabels() {
  const { t } = useTranslation("reporting");
  return {
    empty: t("alerts.empty"),
    viewAction: t("alerts.viewAction"),
    viewActionFor: (title: string) => t("alerts.viewActionFor", { title }),
    source: (source: ReportingAlert["source"]) =>
      source === "stock" ? t("alerts.sourceStock") : source === "production" ? t("alerts.sourceProduction") : t("alerts.sourceFinance"),
  };
}

const meta = {
  title: "Reporting/AlertsPanel",
  parameters: { layout: "padded" },
} satisfies Meta<typeof AlertsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unified: Story = {
  render: () => {
    const labels = useAlertsLabels();
    return <AlertsPanel title="Alerts" alerts={ALERTS} onSelect={() => {}} labels={labels} />;
  },
};

export const Empty: Story = {
  render: () => {
    const labels = useAlertsLabels();
    return <AlertsPanel title="Alerts" alerts={[]} onSelect={() => {}} labels={labels} />;
  },
};

export const Loading: Story = {
  render: () => {
    const labels = useAlertsLabels();
    return <AlertsPanel title="Alerts" alerts={ALERTS} onSelect={() => {}} loading labels={labels} />;
  },
};
