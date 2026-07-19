import * as React from "react";
import { toDecimal } from "@erp/utils";
import { MovementDirection, MovementRefType, type StockCardMovement, type StockCardReport } from "@erp/contracts";
import { MaskedValue, MoneyCell, QtyCell, cn } from "@erp/ui";

export interface StockCardLedgerLabels {
  dateColumn: string;
  refColumn: string;
  inColumn: string;
  outColumn: string;
  balanceColumn: string;
  unitCostColumn: string;
  openingRow: string;
  closingRow: string;
  refType: Record<MovementRefType, string>;
}

const defaultLabels: StockCardLedgerLabels = {
  dateColumn: "Date",
  refColumn: "Ref",
  inColumn: "In",
  outColumn: "Out",
  balanceColumn: "Balance",
  unitCostColumn: "Unit cost",
  openingRow: "Opening balance",
  closingRow: "Closing balance",
  refType: {
    GOODS_RECEIPT: "Goods receipt",
    GOODS_ISSUE: "Goods issue",
    BACKFLUSH: "Backflush",
    ADJUSTMENT: "Adjustment",
    COUNT: "Count",
  },
};

interface LedgerRow {
  key: string;
  date: string | null;
  ref: string | null;
  inQty: string | null;
  outQty: string | null;
  balance: string;
  unitCost: string | null;
  summaryLabel?: string;
}

function buildRows(
  report: StockCardReport,
  labels: StockCardLedgerLabels,
  formatRef: (movement: StockCardMovement) => string,
): LedgerRow[] {
  const rows: LedgerRow[] = [
    {
      key: "opening",
      date: null,
      ref: null,
      inQty: null,
      outQty: null,
      balance: report.opening_qty,
      unitCost: null,
      summaryLabel: labels.openingRow,
    },
  ];

  let balance = toDecimal(report.opening_qty);
  for (const movement of report.movements) {
    const qty = toDecimal(movement.qty);
    balance = balance.plus(movement.direction === MovementDirection.OUT ? qty.negated() : qty);
    const isIn = movement.direction !== MovementDirection.OUT && qty.greaterThanOrEqualTo(0);
    rows.push({
      key: movement.id,
      date: movement.at,
      ref: formatRef(movement),
      inQty: isIn ? qty.abs().toString() : null,
      outQty: isIn ? null : qty.abs().toString(),
      balance: balance.toString(),
      unitCost: movement.unit_cost,
    });
  }

  rows.push({
    key: "closing",
    date: null,
    ref: null,
    inQty: null,
    outQty: null,
    balance: report.closing_qty,
    unitCost: null,
    summaryLabel: labels.closingRow,
  });

  return rows;
}

export interface StockCardLedgerProps {
  report: StockCardReport;
  formatDate?: (iso: string) => string;
  /** Resolve a movement's `ref_type`/`ref_id` into a human-readable reference — defaults to the
   * type label plus the raw uuid; a screen with the source document loaded can supply its code. */
  formatRef?: (movement: StockCardMovement) => string;
  labels?: Partial<Omit<StockCardLedgerLabels, "refType">> & { refType?: Partial<StockCardLedgerLabels["refType"]> };
  className?: string;
}

const defaultFormatDate = (iso: string) => new Date(iso).toLocaleDateString();

/**
 * The immutable stock-card ledger (M3 §3.1, design MD1) — reads like a bank statement: a running
 * balance per movement (Date · Ref · In · Out · Balance · Unit cost), append-only with no row
 * actions or edit affordances. Corrections only ever arrive as new compensating movements from the
 * backend, never an edited row. Unit cost is masked without `inventory.cost.view`; the on-hand
 * balance always stays visible.
 */
export function StockCardLedger({
  report,
  formatDate = defaultFormatDate,
  formatRef,
  labels: labelsProp,
  className,
}: StockCardLedgerProps) {
  const labels = React.useMemo(
    () => ({
      ...defaultLabels,
      ...labelsProp,
      refType: { ...defaultLabels.refType, ...labelsProp?.refType },
    }),
    [labelsProp],
  );
  const resolveRef = React.useCallback(
    (movement: StockCardMovement) => {
      if (formatRef) return formatRef(movement);
      const typeLabel = labels.refType[movement.ref_type] ?? movement.ref_type;
      return movement.ref_id ? `${typeLabel} · ${movement.ref_id}` : typeLabel;
    },
    [formatRef, labels],
  );
  const rows = React.useMemo(() => buildRows(report, labels, resolveRef), [report, labels, resolveRef]);

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border", className)}>
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-bg-sunken">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.dateColumn}
            </th>
            <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.refColumn}
            </th>
            <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.inColumn}
            </th>
            <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.outColumn}
            </th>
            <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.balanceColumn}
            </th>
            <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.unitCostColumn}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={cn("border-b border-border last:border-b-0", row.summaryLabel && "bg-bg-sunken font-medium")}
            >
              <td className="px-3 py-2 text-text-primary">{row.date ? formatDate(row.date) : row.summaryLabel}</td>
              <td className="px-3 py-2 text-text-secondary">{row.ref}</td>
              <td className="px-3 py-2 text-right">{row.inQty != null && <QtyCell value={row.inQty} />}</td>
              <td className="px-3 py-2 text-right">{row.outQty != null && <QtyCell value={row.outQty} />}</td>
              <td className="px-3 py-2 text-right">
                <QtyCell value={row.balance} />
              </td>
              <td className="px-3 py-2 text-right">
                {row.unitCost != null && (
                  <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={row.unitCost} />} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
