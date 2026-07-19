import * as React from "react";
import { useTranslation } from "react-i18next";
import type { StockAdjustment, StockCount } from "@erp/contracts";
import {
  Button,
  Combobox,
  ConfirmDialog,
  FormField,
  GuardedActionDialog,
  InkChip,
  Input,
  PermissionButton,
  QtyCell,
  useToast,
} from "@erp/ui";
import {
  useApproveStockAdjustmentMutation,
  useCreateStockCountMutation,
  useItemsQuery,
  usePostStockAdjustmentMutation,
  useReconcileStockCountMutation,
  useSetStockCountLinesMutation,
} from "../../../inventory/queries.js";

/**
 * The stock-count + adjustment workspace (M3 §4.4, design MD4). The `inventory` contract has no
 * list/get endpoint for counts or adjustments (create + action endpoints only) — this screen holds
 * the count (and any adjustment reconciled from it) in local state for the session it's open,
 * rather than fabricating a history the API can't back yet. Every item in an open count shows a
 * "locked for counting" badge — movement is disabled while a count is in progress.
 */
export function StockCountsPage() {
  const { t } = useTranslation("inventory");
  const { toast } = useToast();

  const items = useItemsQuery({ limit: 100 });
  const createCount = useCreateStockCountMutation();
  const setLines = useSetStockCountLinesMutation();
  const reconcile = useReconcileStockCountMutation();
  const approveAdjustment = useApproveStockAdjustmentMutation();
  const postAdjustment = usePostStockAdjustmentMutation();

  const [period, setPeriod] = React.useState("");
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
  const [count, setCount] = React.useState<StockCount | null>(null);
  const [countedQty, setCountedQty] = React.useState<Record<string, string>>({});
  const [adjustment, setAdjustment] = React.useState<StockAdjustment | null>(null);
  const [reconcileOpen, setReconcileOpen] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);

  const itemOptions = (items.data?.body.data ?? []).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }));
  const itemNameById = new Map((items.data?.body.data ?? []).map((i) => [i.id, i.name]));

  async function handleOpenCount() {
    const created = await createCount.mutateAsync({ body: { period, item_ids: selectedItemIds } });
    setCount(created.body.count);
    setCountedQty({});
    setAdjustment(null);
    toast({ tone: "success", title: t("counts.countCreated") });
  }

  async function handleSaveCounts() {
    if (!count) return;
    const lines = count.lines
      .filter((line) => countedQty[line.item_id] !== undefined && countedQty[line.item_id] !== "")
      .map((line) => ({ item_id: line.item_id, counted_qty: countedQty[line.item_id]! }));
    if (lines.length === 0) return;
    const updated = await setLines.mutateAsync({ params: { id: count.id }, body: { lines } });
    setCount(updated.body.count);
    toast({ tone: "success", title: t("counts.countSaved") });
  }

  async function handleReconcile() {
    if (!count) return;
    const result = await reconcile.mutateAsync({ params: { id: count.id }, body: undefined });
    setAdjustment(result.body.adjustment);
    setReconcileOpen(false);
  }

  async function handleApprove() {
    if (!adjustment) return;
    const result = await approveAdjustment.mutateAsync({ params: { id: adjustment.id }, body: undefined });
    setAdjustment(result.body.adjustment);
    setApproveOpen(false);
    toast({ tone: "success", title: t("counts.approved") });
  }

  async function handlePost() {
    if (!adjustment) return;
    const result = await postAdjustment.mutateAsync({ params: { id: adjustment.id }, body: undefined });
    setAdjustment(result.body.adjustment);
    toast({ tone: "success", title: t("counts.posted") });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("counts.title")}</h1>

      {!count ? (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          <p className="text-sm text-text-muted">{t("counts.noOpenCount")}</p>
          <FormField label={t("counts.fieldPeriod")} required>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} required />
          </FormField>
          <FormField label={t("counts.fieldItems")}>
            <Combobox multiple value={selectedItemIds} onValueChange={setSelectedItemIds} options={itemOptions} loading={items.isLoading} aria-label={t("counts.fieldItems")} />
          </FormField>
          <PermissionButton
            required="inventory.issue.manage"
            onClick={() => void handleOpenCount()}
            loading={createCount.isPending}
            className="self-start"
          >
            {t("counts.openCount")}
          </PermissionButton>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          <p className="text-caption text-text-muted">{t("counts.countListNote")}</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-bg-sunken">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {t("counts.columnItem")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {t("counts.lockedBadge")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {t("counts.columnSystemQty")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {t("counts.columnCountedQty")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {count.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-text-primary">{itemNameById.get(line.item_id) ?? line.item_id}</td>
                    <td className="px-3 py-2">
                      <InkChip status="hold" label={t("counts.lockedBadge")} />
                      <span className="sr-only">{t("counts.lockedExplain")}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <QtyCell value={line.system_qty} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        value={countedQty[line.item_id] ?? line.counted_qty ?? ""}
                        onChange={(e) => setCountedQty((prev) => ({ ...prev, [line.item_id]: e.target.value }))}
                        className="w-28 text-right"
                        aria-label={`${t("counts.columnCountedQty")} — ${itemNameById.get(line.item_id) ?? line.item_id}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void handleSaveCounts()} loading={setLines.isPending}>
              {t("counts.saveCounts")}
            </Button>
            <Button onClick={() => setReconcileOpen(true)} disabled={Boolean(adjustment)}>
              {t("counts.reconcile")}
            </Button>
          </div>
        </section>
      )}

      {adjustment && (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          <h2 className="text-h3 font-semibold text-text-primary">{t("counts.adjustmentDraftedTitle")}</h2>
          <p className="text-sm text-text-secondary">
            {t("counts.fieldReason")}: {adjustment.reason}
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
                {t("counts.approveAdjustment")}
              </PermissionButton>
            )}
            {adjustment.status === "APPROVED" && (
              <PermissionButton required="inventory.adjustment.approve" onClick={() => void handlePost()} loading={postAdjustment.isPending}>
                {t("counts.postAdjustment")}
              </PermissionButton>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
        title={t("counts.reconcileTitle")}
        consequence={t("counts.reconcileConsequence")}
        onConfirm={() => void handleReconcile()}
        loading={reconcile.isPending}
      />

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
