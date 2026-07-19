import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { ScanField, type ScanEntry, type ScanFieldLabels } from "@erp/ui";

/** Wires `ScanField`'s labels to the real `inventory` namespace so the Storybook toolbar's locale
 * control retranslates it — the same wiring `goods-issues.tsx` uses for the scan-first issue
 * screen (M3 §4.3/§5.3). `ScanField` itself lives in `@erp/ui` (promoted per design MD6) and only
 * takes plain-string `labels`, so this demo shows M3's actual translated wiring for its screen. */
function useScanLabels(): ScanFieldLabels {
  const { t } = useTranslation("inventory");
  return {
    placeholder: t("scan.placeholder"),
    qtyLabel: t("scan.qtyLabel"),
    addButton: t("scan.addButton"),
    cameraButton: t("scan.cameraButton"),
    undo: t("scan.undo"),
    lastScans: t("scan.lastScans"),
    decrement: t("scan.decrement"),
    increment: t("scan.increment"),
  };
}

function GoodsIssueScanDemo({ touch = false }: { touch?: boolean }) {
  const [scans, setScans] = React.useState<ScanEntry[]>([
    { id: "1", code: "FAB-BLK-001", qty: "12" },
  ]);
  const labels = useScanLabels();
  return (
    <div data-density={touch ? "touch" : undefined} className="max-w-md">
      <ScanField
        recentScans={scans}
        unit="m"
        labels={labels}
        onScan={(code, qty) => setScans((prev) => [{ id: crypto.randomUUID(), code, qty }, ...prev])}
        onUndo={(id) => setScans((prev) => prev.filter((s) => s.id !== id))}
        onCameraScan={() => {}}
      />
    </div>
  );
}

const meta = {
  title: "Inventory/GoodsIssueScanField",
  parameters: { layout: "padded" },
} satisfies Meta<typeof GoodsIssueScanDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Comfortable/compact density — the desktop goods-issue view. */
export const Desktop: Story = {
  render: () => <GoodsIssueScanDemo />,
};

/** Touch density — auto-applied on the goods-issue route's `kiosk: true` metadata on a handheld,
 * where every scan/qty/undo target meets the ≥56px `--density-tap-min` floor (M3 §5.2). */
export const Touch: Story = {
  render: () => <GoodsIssueScanDemo touch />,
};
