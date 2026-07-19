import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { ChartPanel, type ChartRow } from "./chart-panel";

const MONTHLY_DATA: ChartRow[] = [
  { m: "2026-01", sales: 100, cost: 60 },
  { m: "2026-02", sales: 140, cost: 80 },
  { m: "2026-03", sales: 90, cost: 55 },
  { m: "2026-04", sales: 160, cost: 95 },
];

const SPLIT_DATA: ChartRow[] = [
  { product: "T-shirt", sales: 400 },
  { product: "Polo", sales: 260 },
  { product: "Jacket", sales: 180 },
];

/** Wires the empty-state label to the real `reporting` namespace so the Storybook toolbar's
 * locale control retranslates it (M6 §5.3). */
function useChartLabels() {
  const { t } = useTranslation("reporting");
  return { emptyLabel: t("chart.empty") };
}

const meta = {
  title: "Reporting/ChartPanel",
  parameters: { layout: "padded" },
} satisfies Meta<typeof ChartPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {
  render: () => {
    const [activeValue, setActiveValue] = React.useState<string | undefined>(undefined);
    const labels = useChartLabels();
    return (
      <ChartPanel
        title="Sales by month"
        kind="bar"
        data={MONTHLY_DATA}
        xKey="m"
        series={[{ key: "sales", label: "Sales" }]}
        activeValue={activeValue}
        onSelect={setActiveValue}
        {...labels}
      />
    );
  },
};

export const Line: Story = {
  render: () => {
    const labels = useChartLabels();
    return (
      <ChartPanel
        title="Sales vs. cost trend"
        kind="line"
        data={MONTHLY_DATA}
        xKey="m"
        series={[
          { key: "sales", label: "Sales" },
          { key: "cost", label: "Cost" },
        ]}
        {...labels}
      />
    );
  },
};

export const Pie: Story = {
  render: () => {
    const labels = useChartLabels();
    return (
      <ChartPanel title="Sales by product" kind="pie" data={SPLIT_DATA} xKey="product" series={[{ key: "sales", label: "Sales" }]} {...labels} />
    );
  },
};

export const ActiveSlice: Story = {
  render: () => {
    const labels = useChartLabels();
    return (
      <ChartPanel
        title="Sales by month (January selected)"
        kind="bar"
        data={MONTHLY_DATA}
        xKey="m"
        series={[{ key: "sales", label: "Sales" }]}
        activeValue="2026-01"
        {...labels}
      />
    );
  },
  parameters: {
    docs: { description: { story: "`activeValue` dims every bar except the matching cross-filter slice (design MD1)." } },
  },
};

export const Loading: Story = {
  render: () => {
    const labels = useChartLabels();
    return <ChartPanel title="Sales by month" kind="bar" data={MONTHLY_DATA} xKey="m" series={[{ key: "sales", label: "Sales" }]} loading {...labels} />;
  },
};

export const Empty: Story = {
  render: () => {
    const labels = useChartLabels();
    return <ChartPanel title="Sales by month" kind="bar" data={[]} xKey="m" series={[{ key: "sales", label: "Sales" }]} {...labels} />;
  },
};
