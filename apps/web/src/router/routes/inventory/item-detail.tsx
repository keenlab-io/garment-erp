import * as React from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { RollupResult } from "@erp/contracts";
import {
  Button,
  Combobox,
  FormField,
  Input,
  MaskedValue,
  MoneyCell,
  PermissionButton,
  Skeleton,
  cn,
  useToast,
} from "@erp/ui";
import { INVENTORY_ITEMS_PATH } from "../../../nav/inventory-paths.js";
import {
  useCreateBomMutation,
  useCreateSkuMutation,
  useItemsQuery,
  useRollupBomMutation,
  useStockCardReportQuery,
} from "../../../inventory/queries.js";
import { StockCardLedger } from "../../../inventory/components/stock-card-ledger.js";
import { BomTreeEditor, type BomTreeNode } from "../../../inventory/components/bom-tree-editor.js";

const TABS = ["overview", "skus", "lots", "stock-card", "bom"] as const;
type ItemTab = (typeof TABS)[number];

const TAB_LABEL_KEY = {
  overview: "itemDetail.tabOverview",
  skus: "itemDetail.tabSkus",
  lots: "itemDetail.tabLots",
  "stock-card": "itemDetail.tabStockCard",
  bom: "itemDetail.tabBom",
} as const satisfies Record<ItemTab, string>;

/**
 * The item detail screen (M3 §4.1, design MD1): tabbed Overview · SKUs · Lots · Stock card · BOM.
 * The `inventory` contract has no per-id `GET /items/{id}` (list + action endpoints only, same gap
 * `hr`'s payroll-run-detail documents) — the item is read off the items list query, matched by id;
 * an item beyond the first 100 rows isn't reachable this way yet.
 */
export function ItemDetailPage() {
  const { id } = useParams({ from: "/inventory/items/$id" });
  const { t } = useTranslation("inventory");
  const [tab, setTab] = React.useState<ItemTab>("overview");

  const items = useItemsQuery({ limit: 100 });
  const item = items.data?.body.data.find((i) => i.id === id);

  if (items.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (items.isError || !item) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm text-danger">{items.isError ? t("itemDetail.loadError") : t("itemDetail.notFound")}</p>
        <Link to={INVENTORY_ITEMS_PATH} className="text-sm text-text-link">
          ← {t("itemDetail.backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to={INVENTORY_ITEMS_PATH} className="text-sm text-text-link">
          ← {t("itemDetail.back")}
        </Link>
        <h1 className="font-display text-h1 font-semibold text-text-primary">{item.name}</h1>
        <p className="text-sm text-text-secondary">{item.code}</p>
      </div>

      <div role="tablist" aria-label={t("itemDetail.tabOverview")} className="flex gap-1 border-b border-border">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              tab === key ? "border-b-2 border-accent text-text-primary" : "text-text-muted hover:text-text-primary",
            )}
          >
            {t(TAB_LABEL_KEY[key])}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("itemDetail.fieldCode")}</dt>
              <dd className="font-mono text-mono text-text-primary">{item.code}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("itemDetail.fieldType")}</dt>
              <dd className="text-text-primary">{item.item_type}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("itemDetail.fieldCostingMethod")}</dt>
              <dd className="text-text-primary">{item.costing_method}</dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("itemDetail.fieldStandardCost")}</dt>
              <dd className="text-text-primary">
                <MaskedValue permission="inventory.cost.view" value={item.standard_cost ? <MoneyCell value={item.standard_cost} /> : "—"} />
              </dd>
            </div>
            <div>
              <dt className="text-caption uppercase tracking-wide text-text-muted">{t("itemDetail.fieldMinStock")}</dt>
              <dd className="text-text-primary">{item.min_stock ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}

      {tab === "skus" && <SkusTab itemId={item.id} />}
      {tab === "lots" && <p className="text-sm text-text-muted">{t("itemDetail.lotsEmpty")}</p>}
      {tab === "stock-card" && <StockCardTab itemId={item.id} />}
      {tab === "bom" && <BomTab itemId={item.id} itemName={item.name} isFinished={item.item_type === "FINISHED"} />}
    </div>
  );
}

function SkusTab({ itemId }: { itemId: string }) {
  const { t } = useTranslation("inventory");
  const { toast } = useToast();
  const createSku = useCreateSkuMutation();
  const [skus, setSkus] = React.useState<Array<{ id: string; variant: string; barcode: string | null }>>([]);
  const [variant, setVariant] = React.useState("");
  const [barcode, setBarcode] = React.useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createSku.mutate(
      { params: { id: itemId }, body: { variant, barcode: barcode || undefined } },
      {
        onSuccess: (result) => {
          setSkus((prev) => [...prev, result.body.sku]);
          setVariant("");
          setBarcode("");
          toast({ tone: "success", title: t("itemDetail.skuCreated") });
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      <p className="text-caption text-text-muted">{t("itemDetail.skusSessionNote")}</p>
      {skus.length === 0 ? (
        <p className="text-sm text-text-muted">{t("itemDetail.skusEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {skus.map((sku) => (
            <li key={sku.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="text-text-primary">{sku.variant}</span>
              <span className="font-mono text-mono text-text-secondary">{sku.barcode ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <FormField label={t("itemDetail.fieldVariant")} required>
          <Input value={variant} onChange={(e) => setVariant(e.target.value)} required />
        </FormField>
        <FormField label={t("itemDetail.fieldBarcode")}>
          <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </FormField>
        <PermissionButton required="inventory.product.create" type="submit" loading={createSku.isPending}>
          {t("itemDetail.createSku")}
        </PermissionButton>
      </form>
    </section>
  );
}

function StockCardTab({ itemId }: { itemId: string }) {
  const { t } = useTranslation(["inventory", "common"]);
  const report = useStockCardReportQuery({ item_id: itemId });

  if (report.isLoading) return <Skeleton className="h-40 w-full" />;
  if (report.isError || !report.data) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-danger">{t("itemDetail.stockCardLoadError")}</p>
        <Button variant="secondary" onClick={() => report.refetch()}>
          {t("common:actions.retry")}
        </Button>
      </div>
    );
  }

  if (report.data.body.movements.length === 0) {
    return <p className="text-sm text-text-muted">{t("itemDetail.stockCardEmpty")}</p>;
  }

  return <StockCardLedger report={report.data.body} />;
}

function BomTab({ itemId, itemName, isFinished }: { itemId: string; itemName: string; isFinished: boolean }) {
  const { t } = useTranslation("inventory");
  const { toast } = useToast();
  const items = useItemsQuery({ limit: 100 });
  const createBom = useCreateBomMutation();
  const rollupBom = useRollupBomMutation();
  const [rollup, setRollup] = React.useState<RollupResult | null>(null);
  const [lines, setLines] = React.useState<Array<{ itemId: string; uomId: string; qty: string; scrapPct: string }>>([
    { itemId: "", uomId: "", qty: "1", scrapPct: "0" },
  ]);

  const itemOptions = (items.data?.body.data ?? [])
    .filter((i) => i.id !== itemId)
    .map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }));
  const itemNameById = new Map((items.data?.body.data ?? []).map((i) => [i.id, i.name]));

  if (!isFinished) {
    return <p className="text-sm text-text-muted">{t("itemDetail.bomOnlyForFinished")}</p>;
  }

  async function handleCreate() {
    const validLines = lines.filter((l) => l.itemId && l.uomId && l.qty);
    if (validLines.length === 0) return;
    const created = await createBom.mutateAsync({
      body: {
        finished_item_id: itemId,
        lines: validLines.map((l) => ({ item_id: l.itemId, uom_id: l.uomId, qty: l.qty, scrap_pct: l.scrapPct || "0" })),
      },
    });
    const result = await rollupBom.mutateAsync({ params: { id: created.body.bom.id }, body: undefined });
    setRollup(result.body);
    toast({ tone: "success", title: t("itemDetail.bomCreated") });
  }

  if (rollup) {
    const root: BomTreeNode = {
      id: rollup.bom_id,
      itemLabel: itemName,
      qty: "1",
      scrapPct: "0",
      unitCost: rollup.conversion_cost,
      extendedCost: rollup.rolled_up_cost,
      children: rollup.components.map((c) => ({
        id: `${rollup.bom_id}-${c.item_id}`,
        itemLabel: itemNameById.get(c.item_id) ?? c.item_id,
        qty: c.qty,
        scrapPct: c.scrap_pct,
        unitCost: c.unit_cost,
        extendedCost: c.extended_cost,
      })),
    };
    return (
      <div className="flex flex-col gap-3">
        <p className="text-caption text-text-muted">{t("itemDetail.bomSessionNote")}</p>
        <BomTreeEditor
          root={root}
          conversionCost={rollup.conversion_cost}
          rolledUpCost={rollup.rolled_up_cost}
          expandedIds={[]}
          onToggleExpand={() => {}}
        />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      <p className="text-sm text-text-muted">{t("itemDetail.bomEmpty")}</p>
      <div className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <div key={index} className="flex items-end gap-3">
            <FormField label={t("itemDetail.fieldComponentItem")} className="flex-1">
              <Combobox
                value={line.itemId}
                onValueChange={(value) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, itemId: value } : l)))}
                options={itemOptions}
                loading={items.isLoading}
                aria-label={t("itemDetail.fieldComponentItem")}
              />
            </FormField>
            <FormField label={t("items.fieldBaseUomId")}>
              <Input
                value={line.uomId}
                onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, uomId: e.target.value } : l)))}
                className="w-40"
              />
            </FormField>
            <FormField label={t("itemDetail.fieldQty")}>
              <Input
                type="number"
                value={line.qty}
                onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, qty: e.target.value } : l)))}
                className="w-24"
              />
            </FormField>
            <FormField label={t("itemDetail.fieldScrapPct")}>
              <Input
                type="number"
                step="0.01"
                value={line.scrapPct}
                onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, scrapPct: e.target.value } : l)))}
                className="w-24"
              />
            </FormField>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              disabled={lines.length === 1}
            >
              {t("itemDetail.removeLine")}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLines((prev) => [...prev, { itemId: "", uomId: "", qty: "1", scrapPct: "0" }])}
          className="self-start"
        >
          {t("itemDetail.addComponentLine")}
        </Button>
      </div>
      <PermissionButton
        required="inventory.product.create"
        onClick={() => void handleCreate()}
        loading={createBom.isPending || rollupBom.isPending}
        className="self-start"
      >
        {t("itemDetail.createBom")}
      </PermissionButton>
    </section>
  );
}
