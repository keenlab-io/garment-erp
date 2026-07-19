import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { SubcontractSlaChip, type SubcontractSlaChipProps } from "./subcontract-sla-chip";

const NOW = new Date("2026-07-19T08:00:00.000Z");

/** Wires the chip's `labels` to the real `production` namespace so the Storybook toolbar's locale
 * control retranslates it (M4 §5.3, mirrors `subcontracts.tsx`'s screen-level wiring). */
function Demo(props: Partial<SubcontractSlaChipProps> & Pick<SubcontractSlaChipProps, "slaDue" | "status">) {
  const { t } = useTranslation("production");
  return (
    <SubcontractSlaChip
      now={NOW}
      {...props}
      labels={{
        due: (duration) => t("subcontractSlaChip.due", { duration }),
        overdue: (duration) => t("subcontractSlaChip.overdue", { duration }),
        received: t("subcontractSlaChip.received"),
        noDueDate: t("subcontractSlaChip.noDueDate"),
      }}
    />
  );
}

const meta = {
  title: "Production/SubcontractSlaChip",
  parameters: { layout: "padded" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DueSoon: Story = {
  render: () => <Demo slaDue="2026-07-19T10:00:00.000Z" status="SENT" />,
};

export const Overdue: Story = {
  render: () => <Demo slaDue="2026-07-19T06:00:00.000Z" status="SENT" />,
};

export const Received: Story = {
  render: () => <Demo slaDue="2026-07-19T06:00:00.000Z" status="RECEIVED" />,
};
