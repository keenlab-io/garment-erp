import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertRail, type AlertRailAlert } from "./alert-rail";

const ALERTS: AlertRailAlert[] = [
  { id: "step-1", title: "WO-114 · Sew", detail: "Sew is running over its 40m standard", chipStatus: "delayed" },
  { id: "sub-1", title: "WO-097 · Embroidery", detail: "Subcontract SLA overdue by 3h", chipStatus: "overdue" },
];

const meta = {
  title: "Production/AlertRail",
  component: AlertRail,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AlertRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAlerts: Story = {
  args: { alerts: ALERTS },
};

export const Empty: Story = {
  args: { alerts: [] },
};
