import * as React from "react";
import { useTranslation } from "react-i18next";
import type { StockAdjustment } from "@erp/contracts";
import { Button, Combobox, FormField, GuardedActionDialog, Input, PermissionButton, QtyCell, useToast } from "@erp/ui";
import {
  useApproveStockAdjustmentMutation,
  useCreateStockAdjustmentMutation,
  useItemsQuery,
  usePostStockAdjustmentMutation,
} from "../../../inventory/queries.js";

interface AdjustmentLineState {
  id: string;
  itemId: string;
  warehouseId: string;
  qtyDelta: string;
}

function emptyLine(): AdjustmentLineState {
  return { id: crypto.randomUUID(), itemId: "", warehouseId: "", qtyDelta: "0" };
}

/**
 * The manual stock-adjustment screen (M3 §4.4, design MD4): a reason-gated create form (blank
 * reason blocks submit with an inline field error, per the contract's `CreateStockAdjustmentRequest`)
 * plus guarded approve/post on the adjustment just created. Like `StockCountsPage`, the contract has
 * no adjustment-listing endpoint, so only the session's own adjustment is shown.
 */
export function StockAdjustmentsPage() {
  const { t } = useTranslation("inventory");
  const { toast } = useToast();

  const items = useItemsQuery({ limit: 100 });
  const createAdjustment = useCreateStockAdjustmentMutation();
  const approveAdjustment = useApproveStockAdjustmentMutation();
  const postAdjustment = usePostStockAdjustmentMutation();

  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string>();
  const [lines, setLines] = React.useState<AdjustmentLineState[]>([emptyLine()]);
  const [adjustment, setAdjustment] = React.useState<StockAdjustment | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);

  const itemOptions = (items.data?.body.data ?? []).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }));
  const itemNameById = new Map((items.data?.body.data ?? []).map((i) => [i.id, i.name]));

  function updateLine(id: string, patch: Partial<AdjustmentLineState>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim() === "") {
      setReasonError(t("adjustments.reasonRequired"));
      return;
    }
    setReasonError(undefined);
    const validLines = lines.filter((l) => l.itemId && l.qtyDelta);
    if (validLines.length === 0) return;
    const created = await createAdjustment.mutateAsync({
      body: {
        reason,
        lines: validLines.map((l) => ({ item_id: l.itemId, warehouse_id: l.warehouseId || undefined, qty_delta: l.qtyDelta })),
      },
    });
    setAdjustment(created.body.adjustment);
    setReason("");
    setLines([emptyLine()]);
    toast({ tone: "success", title: t("adjustments.created") });
  }

  async function handleApprove() {
    if (!adjustment) return;
    const result = await approveAdjustment.mutateAsync({ params: { id: adjustment.id }, body: undefined });
    setAdjustment(result.body.adjustment);
    setApproveOpen(false);
    toast({ tone: "success", title: t("adjustments.approved") });
  }

  async function handlePost() {
    if (!adjustment) return;
    const result = await postAdjustment.mutateAsync({ params: { id: adjustment.id }, body: undefined });
    setAdjustment(result.body.adjustment);
    toast({ tone: "success", title: t("adjustments.posted") });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("adjustments.title")}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <FormField label={t("adjustments.fieldReason")} required error={reasonError}>
          <Input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError(undefined);
            }}
          />
        </FormField>
        {lines.map((line) => (
          <div key={line.id} className="flex flex-wrap items-end gap-3">
            <FormField label={t("adjustments.fieldItem")} className="min-w-48 flex-1">
              <Combobox
                value={line.itemId}
                onValueChange={(value) => updateLine(line.id, { itemId: value })}
                options={itemOptions}
                loading={items.isLoading}
                aria-label={t("adjustments.fieldItem")}
              />
            </FormField>
            <FormField label={t("adjustments.fieldWarehouseId")}>
              <Input value={line.warehouseId} onChange={(e) => updateLine(line.id, { warehouseId: e.target.value })} className="w-40" />
            </FormField>
            <FormField label={t("adjustments.fieldQtyDelta")}>
              <Input type="number" value={line.qtyDelta} onChange={(e) => updateLine(line.id, { qtyDelta: e.target.value })} className="w-28" />
            </FormField>
            <Button type="button" variant="ghost" onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))} disabled={lines.length === 1}>
              {t("adjustments.removeLine")}
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="self-start">
          {t("adjustments.addLine")}
        </Button>
        <Button type="submit" loading={createAdjustment.isPending} className="self-start">
          {t("adjustments.submit")}
        </Button>
      </form>

      {adjustment ? (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          <p className="text-sm text-text-secondary">
            {t("adjustments.fieldReason")}: {adjustment.reason}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {adjustment.lines.map((line) => (
              <li key={line.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-text-primary">{itemNameById.get(line.item_id) ?? line.item_id}</span>
                <QtyCell value={line.qty_delta} />
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {adjustment.status === "DRAFT" && (
              <PermissionButton required="inventory.adjustment.approve" onClick={() => setApproveOpen(true)}>
                {t("adjustments.approve")}
              </PermissionButton>
            )}
            {adjustment.status === "APPROVED" && (
              <PermissionButton required="inventory.adjustment.approve" onClick={() => void handlePost()} loading={postAdjustment.isPending}>
                {t("adjustments.post")}
              </PermissionButton>
            )}
          </div>
        </section>
      ) : (
        <p className="text-sm text-text-muted">{t("adjustments.noneYet")}</p>
      )}

      {adjustment && (
        <GuardedActionDialog
          open={approveOpen}
          onOpenChange={setApproveOpen}
          kind="stock-adjustment"
          subject={adjustment.reason}
          onConfirm={() => void handleApprove()}
          loading={approveAdjustment.isPending}
        />
      )}
    </div>
  );
}
