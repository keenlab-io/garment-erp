import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubcontractSlaChip } from "./subcontract-sla-chip";

const NOW = new Date("2026-07-19T08:00:00.000Z");

const meta = {
  title: "Production/SubcontractSlaChip",
  component: SubcontractSlaChip,
  args: { now: NOW },
  parameters: { layout: "padded" },
} satisfies Meta<typeof SubcontractSlaChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DueSoon: Story = {
  args: { slaDue: "2026-07-19T10:00:00.000Z", status: "SENT" },
};

export const Overdue: Story = {
  args: { slaDue: "2026-07-19T06:00:00.000Z", status: "SENT" },
};

export const Received: Story = {
  args: { slaDue: "2026-07-19T06:00:00.000Z", status: "RECEIVED" },
};
