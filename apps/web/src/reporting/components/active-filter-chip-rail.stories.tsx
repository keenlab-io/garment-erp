import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { ActiveFilterChipRail, type ActiveFilterChip } from "./active-filter-chip-rail";

/** Wires the rail's `labels` to the real `reporting` namespace so the Storybook toolbar's locale
 * control retranslates it (M6 §5.3, mirrors `vat-mode-calc-toggle.stories.tsx`'s wiring). */
function Harness({ initialChips }: { initialChips: ActiveFilterChip[] }) {
  const { t } = useTranslation("reporting");
  const [chips, setChips] = React.useState(initialChips);
  return (
    <ActiveFilterChipRail
      chips={chips}
      onRemove={(key) => setChips((prev) => prev.filter((chip) => chip.key !== key))}
      onClear={() => setChips([])}
      labels={{
        groupLabel: t("filters.groupLabel"),
        clear: t("filters.clear"),
        remove: (label) => t("filters.removeFilter", { label }),
      }}
    />
  );
}

const meta = {
  title: "Reporting/ActiveFilterChipRail",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleFilter: Story = {
  render: () => <Harness initialChips={[{ key: "dimension", label: "Month: January 2026" }]} />,
};

export const MultipleFilters: Story = {
  render: () => (
    <Harness
      initialChips={[
        { key: "dimension", label: "Month: January 2026" },
        { key: "customer_id", label: "Customer: Acme Co." },
      ]}
    />
  ),
};

export const NoRemoveAction: Story = {
  render: () => (
    <ActiveFilterChipRail chips={[{ key: "dimension", label: "Month: January 2026" }]} onClear={() => {}} />
  ),
  parameters: {
    docs: { description: { story: "Omitting `onRemove` hides the per-chip × — only the Clear-all action remains." } },
  },
};

export const Empty: Story = {
  render: () => <ActiveFilterChipRail chips={[]} onClear={() => {}} />,
  parameters: {
    docs: { description: { story: "Renders nothing when no filter is applied." } },
  },
};
