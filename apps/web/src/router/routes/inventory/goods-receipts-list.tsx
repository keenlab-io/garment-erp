import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { GoodsReceiptStatus } from "@erp/contracts";
import { DataTable, InkChip, MaskedValue, MoneyCell, PermissionButton, textColumn, useToast, type ChipStatus } from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import {
  useConfirmGoodsReceiptMutation,
  useGoodsReceiptsQuery,
  usePostGoodsReceiptMutation,
} from "../../../inventory/queries.js";
import { GoodsReceiptWizard } from "../../../inventory/components/goods-receipt-wizard.js";

interface ReceiptRow {
  id: string;
  code: string;
  supplierId: string;
  status: GoodsReceiptStatus;
  landedCostTotal: string | null;
  allocMethod: string | null;
}

const STATUS_CHIP: Record<GoodsReceiptStatus, ChipStatus> = {
  DRAFT: "draft",
  CONFIRMED: "pending",
  POSTED: "posted",
};

/**
 * The goods-receipts list (M3 §4.2, design MD3): the Data Table over `GET /goods-receipts` plus
 * the receipt wizard (lines → landed-cost → review, opened from "New receipt") and the explicit
 * Confirm/Post row actions that move a receipt DRAFT → CONFIRMED → POSTED.
 */
export function GoodsReceiptsListPage() {
  const { t } = useTranslation("inventory");
  const { toast } = useToast();
  const { density } = useDensity();

  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([undefined]);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const cursor = cursorStack[cursorStack.length - 1];

  const receipts = useGoodsReceiptsQuery(cursor ? { cursor } : {});
  const confirmReceipt = useConfirmGoodsReceiptMutation();
  const postReceipt = usePostGoodsReceiptMutation();

  const rows = React.useMemo<ReceiptRow[]>(
    () =>
      (receipts.data?.body.data ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        supplierId: r.supplier_id,
        status: r.status,
        landedCostTotal: r.landed_cost_total,
        allocMethod: r.alloc_method,
      })),
    [receipts.data],
  );

  const statusLabel = React.useCallback(
    (status: GoodsReceiptStatus) =>
      status === "DRAFT" ? t("receipts.statusDraft") : status === "CONFIRMED" ? t("receipts.statusConfirmed") : t("receipts.statusPosted"),
    [t],
  );

  const columns = React.useMemo<ColumnDef<ReceiptRow>[]>(
    () => [
      textColumn<ReceiptRow>("code", { header: t("receipts.columnCode"), mono: true }),
      textColumn<ReceiptRow>("supplierId", { header: t("receipts.columnSupplier"), secondary: true }),
      {
        id: "status",
        header: t("receipts.columnStatus"),
        cell: ({ row }) => <InkChip status={STATUS_CHIP[row.original.status]} label={statusLabel(row.original.status)} />,
      },
      {
        id: "landedCostTotal",
        header: t("receipts.columnLandedCost"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <MaskedValue
            permission="inventory.cost.view"
            value={row.original.landedCostTotal ? <MoneyCell value={row.original.landedCostTotal} /> : "—"}
          />
        ),
      },
      { id: "allocMethod", header: t("receipts.columnAllocMethod"), meta: { secondary: true }, cell: ({ row }) => row.original.allocMethod ?? "—" },
    ],
    [t, statusLabel],
  );

  const nextCursor = receipts.data?.body.next_cursor ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("receipts.title")}</h1>
        <PermissionButton required="inventory.receipt.manage" onClick={() => setWizardOpen(true)}>
          {t("receipts.newReceipt")}
        </PermissionButton>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        tableId="inventory-receipts"
        density={density}
        isLoading={receipts.isLoading}
        error={receipts.isError ? { message: t("receipts.loadError") } : null}
        onRetry={() => receipts.refetch()}
        emptyState={{ title: t("receipts.empty") }}
        nextCursor={nextCursor}
        onNextPage={() => {
          if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
        }}
        onPrevPage={cursorStack.length > 1 ? () => setCursorStack((stack) => stack.slice(0, -1)) : undefined}
        rowActions={(row) => [
          ...(row.status === "DRAFT"
            ? [
                {
                  key: "confirm",
                  label: t("receipts.confirmAction"),
                  onClick: () =>
                    confirmReceipt.mutate(
                      { params: { id: row.id }, body: undefined },
                      { onSuccess: () => toast({ tone: "success", title: t("receipts.receiptConfirmed") }) },
                    ),
                },
              ]
            : []),
          ...(row.status === "CONFIRMED"
            ? [
                {
                  key: "post",
                  label: t("receipts.postAction"),
                  onClick: () =>
                    postReceipt.mutate(
                      { params: { id: row.id }, body: undefined },
                      { onSuccess: () => toast({ tone: "success", title: t("receipts.receiptPosted") }) },
                    ),
                },
              ]
            : []),
        ]}
      />

      <GoodsReceiptWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={(code) => toast({ tone: "success", title: t("receipts.receiptCreated", { code }) })}
      />
    </div>
  );
}
