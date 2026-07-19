import * as React from "react";
import { useTranslation } from "react-i18next";
import type { IssuePurpose } from "@erp/contracts";
import {
  FormField,
  Input,
  PermissionButton,
  ScanField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ScanEntry,
  useToast,
} from "@erp/ui";
import { useCreateGoodsIssueMutation, useItemsQuery, usePostGoodsIssueMutation } from "../../../inventory/queries.js";

interface InsufficientStock {
  itemLabel: string;
  remaining: string;
}

/** The uniform error envelope (`{ code, message, details }`) a non-2xx response throws. */
interface ErrorOutcome {
  status: number;
  body: { details: { field?: string; issue: string }[] };
}

function isErrorOutcome(error: unknown): error is ErrorOutcome {
  return typeof error === "object" && error !== null && "status" in error && "body" in error;
}

/**
 * The scan-first goods-issue screen (M3 §4.3, design MD2). Runs in Touch density automatically on
 * a handheld (the route carries `kiosk: true`, M3 §1.1) — a persistent `ScanField` loop against the
 * item catalog's `code` (the contract has no lookup-by-barcode/SKU-barcode endpoint, so the item
 * `code` doubles as the scannable id here), listing the last five scans with undo. Posting drafts
 * then posts the issue in one step; a 422 insufficient-stock response carries the exact remaining
 * qty in `details` (backend fix alongside this screen) and renders inline instead of a generic error.
 */
export function GoodsIssuesPage() {
  const { t } = useTranslation("inventory");
  const { toast } = useToast();

  const items = useItemsQuery({ limit: 100 });
  const createIssue = useCreateGoodsIssueMutation();
  const postIssue = usePostGoodsIssueMutation();

  const [purpose, setPurpose] = React.useState<IssuePurpose>("PRODUCTION");
  const [refWo, setRefWo] = React.useState("");
  const [scans, setScans] = React.useState<Array<ScanEntry & { itemId: string; uomId: string }>>([]);
  const [insufficient, setInsufficient] = React.useState<InsufficientStock | null>(null);

  const itemByCode = React.useMemo(
    () => new Map((items.data?.body.data ?? []).map((i) => [i.code, i])),
    [items.data],
  );
  const itemById = React.useMemo(
    () => new Map((items.data?.body.data ?? []).map((i) => [i.id, i])),
    [items.data],
  );

  function handleScan(code: string, qty: string) {
    const item = itemByCode.get(code);
    if (!item) {
      toast({ tone: "danger", title: t("issues.scanUnknownCode", { code }) });
      return;
    }
    setScans((prev) => [{ id: crypto.randomUUID(), code: item.code, qty, itemId: item.id, uomId: item.base_uom_id }, ...prev]);
  }

  function handleUndo(id: string) {
    setScans((prev) => prev.filter((entry) => entry.id !== id));
  }

  async function handlePost() {
    setInsufficient(null);
    if (scans.length === 0) {
      toast({ tone: "danger", title: t("issues.linesRequired") });
      return;
    }
    try {
      const created = await createIssue.mutateAsync({
        body: {
          purpose,
          ref_wo_id: refWo || undefined,
          lines: scans.map((s) => ({ item_id: s.itemId, uom_id: s.uomId, qty: s.qty })),
        },
      });
      await postIssue.mutateAsync({ params: { id: created.body.issue.id }, body: undefined });
      toast({ tone: "success", title: t("issues.issuePosted") });
      setScans([]);
    } catch (error) {
      if (isErrorOutcome(error)) {
        const itemId = error.body.details.find((d) => d.field === "item_id")?.issue;
        const remaining = error.body.details.find((d) => d.field === "remaining_qty")?.issue;
        if (remaining != null) {
          setInsufficient({ itemLabel: (itemId && itemById.get(itemId)?.name) || itemId || "", remaining });
        }
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("issues.title")}</h1>

      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t("issues.fieldPurpose")}>
          <Select value={purpose} onValueChange={(value) => setPurpose(value as IssuePurpose)}>
            <SelectTrigger aria-label={t("issues.fieldPurpose")} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRODUCTION">{t("issues.purposeProduction")}</SelectItem>
              <SelectItem value="SALE">{t("issues.purposeSale")}</SelectItem>
              <SelectItem value="OTHER">{t("issues.purposeOther")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t("issues.fieldRefWo")}>
          <Input value={refWo} onChange={(e) => setRefWo(e.target.value)} className="w-48" />
        </FormField>
      </div>

      {insufficient && (
        <p className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
          {t("issues.insufficientStock", { remaining: `${insufficient.remaining} ${insufficient.itemLabel}`.trim() })}
        </p>
      )}

      <ScanField recentScans={scans} onScan={handleScan} onUndo={handleUndo} />

      <PermissionButton
        required="inventory.issue.manage"
        onClick={() => void handlePost()}
        loading={createIssue.isPending || postIssue.isPending}
      >
        {t("issues.postIssue")}
      </PermissionButton>
    </div>
  );
}
