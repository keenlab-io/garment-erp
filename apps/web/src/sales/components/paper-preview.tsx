import * as React from "react";
import { toDecimal } from "@erp/utils";
import { MoneyCell, QtyCell, cn } from "@erp/ui";

export interface PaperPreviewLine {
  id: string;
  description: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
}

export interface PaperPreviewCustomer {
  name: string;
  taxId?: string | null;
  branchCode?: string | null;
  address?: string | null;
}

export interface PaperPreviewTotals {
  subtotal: string;
  vatAmount: string;
  grandTotal: string;
  /** Present (and non-zero) only on withholding documents — renders as a deduction + a highlighted
   * "net to receive" row (design MD2). */
  whtAmount?: string | null;
}

export interface PaperPreviewLabels {
  billTo: string;
  docNoLabel: string;
  dateLabel: string;
  descriptionColumn: string;
  qtyColumn: string;
  unitPriceColumn: string;
  amountColumn: string;
  subtotalLabel: string;
  vatLabel: string;
  whtLabel: string;
  netToReceiveLabel: string;
  grandTotalLabel: string;
}

const defaultLabels: PaperPreviewLabels = {
  billTo: "Bill to",
  docNoLabel: "No.",
  dateLabel: "Date",
  descriptionColumn: "Description",
  qtyColumn: "Qty",
  unitPriceColumn: "Unit price",
  amountColumn: "Amount",
  subtotalLabel: "Subtotal",
  vatLabel: "VAT",
  whtLabel: "WHT",
  netToReceiveLabel: "Net to receive",
  grandTotalLabel: "Grand total",
};

export interface PaperPreviewProps {
  /** e.g. "ใบเสนอราคา / Quotation" — the document type name (spec §5.1 BE/CE + Thai names land §5.1). */
  docTypeLabel: string;
  docNo?: string;
  /** Already formatted by the caller (BE/CE date formatting is the screen's job, not this surface's). */
  date?: string;
  customer?: PaperPreviewCustomer;
  lines: PaperPreviewLine[];
  totals: PaperPreviewTotals;
  /** Slot for the PromptPay QR block + signature (M5 §3.3/§3.4). */
  footer?: React.ReactNode;
  labels?: Partial<PaperPreviewLabels>;
  className?: string;
}

/**
 * The live paper-preview surface (M5 §3.2, design MD1) — WYSIWYG: this is the spec for the exported
 * PDF, so it renders on the paper surface (`--color-bg-paper`, always white) using a nested
 * `data-theme="light"` (same trick the app shell uses for ink chrome, CLAUDE.md "Ink chrome via
 * nested data-theme") so the preview never darkens in the app's dark theme. Money is tabular,
 * right-aligned, two decimals; the document number is mono. Totals are passed in (computed live by
 * `sales/totals.ts#computeDocumentTotals`) rather than recomputed here, so this surface stays a pure
 * renderer shared by the editor and any read-only document view.
 */
export function PaperPreview({
  docTypeLabel,
  docNo,
  date,
  customer,
  lines,
  totals,
  footer,
  labels: labelsProp,
  className,
}: PaperPreviewProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const hasWht = totals.whtAmount != null && !toDecimal(totals.whtAmount).isZero();
  const netToReceive = hasWht ? toDecimal(totals.grandTotal).minus(toDecimal(totals.whtAmount!)).toFixed(4) : null;

  return (
    <div
      data-theme="light"
      className={cn(
        "flex flex-col gap-4 rounded-md border border-border bg-bg-paper p-6 text-text-primary shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-h3 font-semibold">{docTypeLabel}</p>
          {customer && (
            <div className="mt-2 text-sm text-text-secondary">
              <p className="text-caption uppercase tracking-wide text-text-muted">{labels.billTo}</p>
              <p className="text-text-primary">{customer.name}</p>
              {customer.taxId && <p>{customer.taxId}</p>}
              {customer.branchCode && <p>{customer.branchCode}</p>}
              {customer.address && <p>{customer.address}</p>}
            </div>
          )}
        </div>
        <div className="text-right text-sm">
          {docNo && (
            <p>
              <span className="text-text-muted">{labels.docNoLabel} </span>
              <span className="font-mono text-mono">{docNo}</span>
            </p>
          )}
          {date && (
            <p>
              <span className="text-text-muted">{labels.dateLabel} </span>
              {date}
            </p>
          )}
        </div>
      </div>

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.descriptionColumn}
            </th>
            <th scope="col" className="py-1.5 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.qtyColumn}
            </th>
            <th scope="col" className="py-1.5 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.unitPriceColumn}
            </th>
            <th scope="col" className="py-1.5 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.amountColumn}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-border last:border-b-0">
              <td className="py-1.5">{line.description}</td>
              <td className="py-1.5 text-right">
                <QtyCell value={line.qty} />
              </td>
              <td className="py-1.5 text-right">
                <MoneyCell value={line.unitPrice} />
              </td>
              <td className="py-1.5 text-right">
                <MoneyCell value={line.lineTotal} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto flex w-full max-w-64 flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{labels.subtotalLabel}</span>
          <MoneyCell value={totals.subtotal} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{labels.vatLabel}</span>
          <MoneyCell value={totals.vatAmount} />
        </div>
        {hasWht && (
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">{labels.whtLabel}</span>
            <MoneyCell value={`-${totals.whtAmount}`} />
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-1 font-semibold">
          <span>{labels.grandTotalLabel}</span>
          <MoneyCell value={totals.grandTotal} />
        </div>
        {hasWht && netToReceive && (
          <div className="mt-1 flex items-center justify-between rounded-md border border-accent bg-accent-subtle px-2 py-1.5 font-semibold text-accent-text">
            <span>{labels.netToReceiveLabel}</span>
            <MoneyCell value={netToReceive} className="text-accent-text" />
          </div>
        )}
      </div>

      {footer && <div className="border-t border-border pt-4">{footer}</div>}
    </div>
  );
}
