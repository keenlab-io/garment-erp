import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { asMoney, asQty, type StockCardReport } from "@erp/contracts";
import { PermissionsProvider } from "@erp/ui";
import { StockCardLedger, type StockCardLedgerLabels } from "./stock-card-ledger";

const REPORT: StockCardReport = {
  item_id: "item-1",
  warehouse_id: null,
  opening_qty: asQty("100"),
  opening_value: asMoney("5000.0000"),
  movements: [
    { id: "m1", at: "2026-07-01T08:00:00.000Z", direction: "IN", qty: asQty("50"), unit_cost: asMoney("12.50"), ref_type: "GOODS_RECEIPT", ref_id: "a1b2c3d4-0000-0000-0000-000000000001" },
    { id: "m2", at: "2026-07-02T09:30:00.000Z", direction: "OUT", qty: asQty("30"), unit_cost: asMoney("12.50"), ref_type: "GOODS_ISSUE", ref_id: "a1b2c3d4-0000-0000-0000-000000000002" },
    { id: "m3", at: "2026-07-03T14:00:00.000Z", direction: "ADJUST", qty: asQty("-5"), unit_cost: asMoney("12.50"), ref_type: "ADJUSTMENT", ref_id: "a1b2c3d4-0000-0000-0000-000000000003" },
  ],
  closing_qty: asQty("115"),
  closing_value: asMoney("5750.0000"),
};

/** Wires the ledger's `labels` to the real `inventory` namespace so the Storybook toolbar's
 * locale control retranslates it (M3 §5.3, mirrors HR's `payroll-wizard.stories.tsx` wiring). */
function useLedgerLabels(): StockCardLedgerLabels {
  const { t } = useTranslation("inventory");
  return {
    dateColumn: t("stockCard.dateColumn"),
    refColumn: t("stockCard.refColumn"),
    inColumn: t("stockCard.inColumn"),
    outColumn: t("stockCard.outColumn"),
    balanceColumn: t("stockCard.balanceColumn"),
    unitCostColumn: t("stockCard.unitCostColumn"),
    openingRow: t("stockCard.openingRow"),
    closingRow: t("stockCard.closingRow"),
    refType: {
      GOODS_RECEIPT: t("stockCard.refTypeGoodsReceipt"),
      GOODS_ISSUE: t("stockCard.refTypeGoodsIssue"),
      BACKFLUSH: t("stockCard.refTypeBackflush"),
      ADJUSTMENT: t("stockCard.refTypeAdjustment"),
      COUNT: t("stockCard.refTypeCount"),
    },
  };
}

const meta = {
  title: "Inventory/StockCardLedger",
  component: StockCardLedger,
  args: { report: REPORT },
  parameters: { layout: "padded" },
} satisfies Meta<typeof StockCardLedger>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCostVisible: Story = {
  render: (args) => {
    const labels = useLedgerLabels();
    return (
      <PermissionsProvider permissions={["inventory.cost.view"]} isSuperAdmin={false}>
        <StockCardLedger {...args} labels={labels} />
      </PermissionsProvider>
    );
  },
};

export const CostMasked: Story = {
  render: (args) => {
    const labels = useLedgerLabels();
    return (
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <StockCardLedger {...args} labels={labels} />
      </PermissionsProvider>
    );
  },
};
