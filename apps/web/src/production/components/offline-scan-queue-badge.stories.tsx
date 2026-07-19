import type { Meta, StoryObj } from "@storybook/react-vite";
import { OfflineScanQueueBadge } from "./offline-scan-queue-badge";

const meta = {
  title: "Production/OfflineScanQueueBadge",
  component: OfflineScanQueueBadge,
  parameters: { layout: "padded" },
} satisfies Meta<typeof OfflineScanQueueBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {
  args: { isOnline: true, queuedCount: 0, syncing: false },
};

export const Offline: Story = {
  args: { isOnline: false, queuedCount: 3, syncing: false },
};

export const Syncing: Story = {
  args: { isOnline: true, queuedCount: 2, syncing: true },
};
