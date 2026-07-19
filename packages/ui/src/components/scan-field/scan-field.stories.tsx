import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScanField, type ScanEntry } from "./scan-field";

const meta = {
  title: "Primitives/ScanField",
  component: ScanField,
  args: { recentScans: [], onScan: () => {}, onUndo: () => {} },
  parameters: { layout: "padded" },
} satisfies Meta<typeof ScanField>;

export default meta;
type Story = StoryObj<typeof meta>;

function GoodsIssueDemo() {
  const [scans, setScans] = React.useState<ScanEntry[]>([]);
  return (
    <ScanField
      recentScans={scans}
      unit="m"
      onScan={(code, qty) => setScans((prev) => [{ id: crypto.randomUUID(), code, qty }, ...prev])}
      onUndo={(id) => setScans((prev) => prev.filter((s) => s.id !== id))}
      onCameraScan={() => alert("Opens the host's camera scan sheet")}
      className="max-w-md"
    />
  );
}

export const GoodsIssueLoop: Story = {
  render: () => <GoodsIssueDemo />,
};

export const WithRecentScans: Story = {
  args: {
    recentScans: [
      { id: "1", code: "FAB-BLK-001", qty: "12" },
      { id: "2", code: "FAB-BLK-001", qty: "8" },
      { id: "3", code: "FAB-WHT-002", qty: "20" },
    ],
    unit: "m",
    onScan: () => {},
    onUndo: () => {},
  },
  render: (args) => <ScanField {...args} className="max-w-md" />,
};

export const Touch: Story = {
  args: {
    recentScans: [{ id: "1", code: "FAB-BLK-001", qty: "12" }],
    unit: "m",
    onScan: () => {},
    onUndo: () => {},
  },
  render: (args) => (
    <div data-density="touch" className="max-w-md">
      <ScanField {...args} />
    </div>
  ),
};
