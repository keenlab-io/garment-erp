import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { PermissionsProvider } from "@erp/ui";
import { KpiStatCard } from "./kpi-stat-card";

/** Wires the masked-state `restricted` label to the real `reporting` namespace so the Storybook
 * toolbar's locale control retranslates it (M6 §5.3, mirrors `stock-card-ledger.stories.tsx`'s
 * `PermissionsProvider` wiring for `inventory.cost.view`-gated figures). */
function useKpiLabels() {
  const { t } = useTranslation("reporting");
  return { restricted: t("kpi.restricted") };
}

const meta = {
  title: "Reporting/KpiStatCard",
  parameters: { layout: "padded" },
} satisfies Meta<typeof KpiStatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UpDelta: Story = {
  render: () => {
    const labels = useKpiLabels();
    return (
      <KpiStatCard
        label="Revenue"
        value="1234567.89"
        format="money"
        delta={{ percent: 12.4 }}
        sparkline={[10, 12, 9, 14, 20, 18, 24]}
        labels={labels}
      />
    );
  },
};

export const DownDelta: Story = {
  render: () => {
    const labels = useKpiLabels();
    return (
      <KpiStatCard
        label="Units sold"
        value="4200"
        format="qty"
        unit="pcs"
        delta={{ percent: -3.1 }}
        sparkline={[24, 20, 18, 16, 14, 12, 10]}
        labels={labels}
      />
    );
  },
};

export const CostVisible: Story = {
  render: () => {
    const labels = useKpiLabels();
    return (
      <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
        <KpiStatCard label="Margin" value="9999" format="money" permission="inventory.cost.view" labels={labels} />
      </PermissionsProvider>
    );
  },
};

export const CostMasked: Story = {
  render: () => {
    const labels = useKpiLabels();
    return (
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <KpiStatCard label="Margin" value="9999" format="money" permission="inventory.cost.view" labels={labels} />
      </PermissionsProvider>
    );
  },
};

export const Loading: Story = {
  render: () => <KpiStatCard label="Revenue" value="0" loading />,
};
