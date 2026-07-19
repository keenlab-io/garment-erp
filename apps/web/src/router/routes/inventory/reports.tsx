import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Combobox,
  FormField,
  Input,
  MaskedValue,
  MoneyCell,
  QtyCell,
  Skeleton,
  cn,
} from "@erp/ui";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import {
  useDeadStockReportQuery,
  useItemsQuery,
  useLowStockReportQuery,
  useStockCardReportQuery,
  useValuationReportQuery,
} from "../../../inventory/queries.js";
import { StockCardLedger, type StockCardLedgerLabels } from "../../../inventory/components/stock-card-ledger.js";
import { StockHealthChip } from "../../../inventory/components/stock-health-chip.js";

const TABS = ["stock-card", "valuation", "low-stock", "dead-stock"] as const;
type ReportTab = (typeof TABS)[number];

const TAB_LABEL_KEY = {
  "stock-card": "reports.tabStockCard",
  valuation: "reports.tabValuation",
  "low-stock": "reports.tabLowStock",
  "dead-stock": "reports.tabDeadStock",
} as const satisfies Record<ReportTab, string>;

/**
 * The inventory reports screen (M3 §4.5, design MD5): stock-card / valuation / low-stock /
 * dead-stock reads, cost and valuation columns masked without `inventory.cost.view`. Barcode
 * printing lives on its own route/nav entry (`/inventory/barcodes`, `BarcodePrintingPage`) — the
 * two share the same `printBarcodes` mutation and id-entry approach.
 */
export function InventoryReportsPage() {
  const { t } = useTranslation("inventory");
  const [tab, setTab] = React.useState<ReportTab>("stock-card");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("reports.title")}</h1>

      <div role="tablist" aria-label={t("reports.title")} className="flex gap-1 border-b border-border">
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

      {tab === "stock-card" && <StockCardReportTab />}
      {tab === "valuation" && <ValuationReportTab />}
      {tab === "low-stock" && <LowStockReportTab />}
      {tab === "dead-stock" && <DeadStockReportTab />}
    </div>
  );
}

/** Wires `StockCardLedger`'s labels to the real `inventory` namespace (M3 §5.1), mirroring
 * `item-detail.tsx`'s wiring for the item-detail stock-card tab. */
function useStockCardLedgerLabels(): StockCardLedgerLabels {
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

function StockCardReportTab() {
  const { t } = useTranslation("inventory");
  const items = useItemsQuery({ limit: 100 });
  const [itemId, setItemId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  const labels = useStockCardLedgerLabels();

  const itemOptions = (items.data?.body.data ?? []).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }));
  const report = useStockCardReportQuery(
    {
      item_id: itemId,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    },
    { enabled: Boolean(itemId) },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t("reports.fieldItem")} className="min-w-64">
          <Combobox value={itemId} onValueChange={setItemId} options={itemOptions} loading={items.isLoading} aria-label={t("reports.fieldItem")} />
        </FormField>
        <FormField label={t("reports.fieldFrom")}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label={t("reports.fieldTo")}>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </div>

      {!itemId ? (
        <p className="text-sm text-text-muted">{t("reports.selectItemPrompt")}</p>
      ) : report.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : report.isError || !report.data ? (
        <p className="text-sm text-danger">{t("reports.loadError")}</p>
      ) : (
        <StockCardLedger report={report.data.body} labels={labels} formatDate={(iso) => dateFormat.format(new Date(iso))} />
      )}
    </div>
  );
}

function ValuationReportTab() {
  const { t } = useTranslation("inventory");
  const items = useItemsQuery({ limit: 100 });
  const [asOf, setAsOf] = React.useState("");
  const report = useValuationReportQuery({ as_of: asOf ? new Date(asOf).toISOString() : undefined });
  const itemNameById = new Map((items.data?.body.data ?? []).map((i) => [i.id, i.name]));

  const rows = report.data?.body.lines ?? [];

  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("reports.fieldAsOf")} className="max-w-48">
        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </FormField>

      {report.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : report.isError ? (
        <p className="text-sm text-danger">{t("reports.loadError")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t("reports.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-bg-sunken">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t("reports.columnItem")}
                </th>
                <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t("reports.columnQtyOnHand")}
                </th>
                <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t("reports.columnAvgCost")}
                </th>
                <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t("reports.columnValue")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={line.item_id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-text-primary">{itemNameById.get(line.item_id) ?? line.item_id}</td>
                  <td className="px-3 py-2 text-right">
                    <QtyCell value={line.qty_on_hand} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={line.avg_cost} />} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={line.value} />} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="px-3 py-2 text-text-primary" colSpan={3}>
                  {t("reports.totalValue")}
                </td>
                <td className="px-3 py-2 text-right">
                  <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={report.data?.body.total_value ?? "0"} />} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function LowStockReportTab() {
  const { t } = useTranslation("inventory");
  const items = useItemsQuery({ limit: 100 });
  const report = useLowStockReportQuery();
  const itemNameById = new Map((items.data?.body.data ?? []).map((i) => [i.id, i.name]));
  const rows = report.data?.body.rows ?? [];

  if (report.isLoading) return <Skeleton className="h-40 w-full" />;
  if (report.isError) return <p className="text-sm text-danger">{t("reports.loadError")}</p>;
  if (rows.length === 0) return <p className="text-sm text-text-muted">{t("reports.empty")}</p>;

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.item_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
          <span className="text-text-primary">{itemNameById.get(row.item_id) ?? row.item_id}</span>
          <span className="flex items-center gap-3">
            <QtyCell value={row.on_hand} />
            <StockHealthChip onHand={row.on_hand} minStock={row.min_stock} label={t("items.healthNearMin")} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function DeadStockReportTab() {
  const { t } = useTranslation("inventory");
  const items = useItemsQuery({ limit: 100 });
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  const [months, setMonths] = React.useState("6");
  const report = useDeadStockReportQuery({ months: Number(months) || 6 });
  const itemNameById = new Map((items.data?.body.data ?? []).map((i) => [i.id, i.name]));
  const rows = report.data?.body.rows ?? [];

  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("reports.fieldMonths")} className="max-w-48">
        <Input type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)} />
      </FormField>

      {report.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : report.isError ? (
        <p className="text-sm text-danger">{t("reports.loadError")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t("reports.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.item_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="text-text-primary">{itemNameById.get(row.item_id) ?? row.item_id}</span>
              <span className="flex items-center gap-3">
                <QtyCell value={row.qty_on_hand} />
                <span className="text-text-secondary">
                  {row.last_movement_at ? dateFormat.format(new Date(row.last_movement_at)) : t("reports.never")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
