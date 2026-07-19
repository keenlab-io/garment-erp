import { toDecimal } from "@erp/utils";
import { FormField, Input, MoneyCell, cn } from "@erp/ui";

export interface WhtNetToReceivePanelLabels {
  subtotalLabel: string;
  vatLabel: string;
  whtRateLabel: string;
  whtAmountLabel: string;
  grandTotalLabel: string;
  netToReceiveLabel: string;
  noWht: string;
}

const defaultLabels: WhtNetToReceivePanelLabels = {
  subtotalLabel: "Subtotal",
  vatLabel: "VAT",
  whtRateLabel: "WHT rate",
  whtAmountLabel: "WHT",
  grandTotalLabel: "Grand total",
  netToReceiveLabel: "Net to receive",
  noWht: "No withholding",
};

export interface WhtNetToReceivePanelProps {
  subtotal: string;
  vatAmount: string;
  grandTotal: string;
  /** A fraction string, e.g. "0.03" for 3% — `null`/absent renders "No withholding". */
  whtRate?: string | null;
  /** Present to make the rate editable (the document editor); omit for a read-only summary
   * (e.g. inside the paper preview). */
  onWhtRateChange?: (rate: string) => void;
  labels?: Partial<WhtNetToReceivePanelLabels>;
  className?: string;
}

/**
 * The WHT / net-to-receive panel (M5 §3.3, design MD2) — shows WHT as a deduction from the grand
 * total with the **net to receive** (what the customer actually transfers) highlighted. `whtAmount`
 * and `netToReceive` are computed here from `subtotal`/`grandTotal`/`whtRate` (the same
 * `subtotal × rate` the server uses in `TotalsService.compute`), so it stays live as the rate is edited.
 */
export function WhtNetToReceivePanel({
  subtotal,
  vatAmount,
  grandTotal,
  whtRate,
  onWhtRateChange,
  labels: labelsProp,
  className,
}: WhtNetToReceivePanelProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const hasWht = whtRate != null && whtRate !== "" && !toDecimal(whtRate).isZero();
  const whtAmount = hasWht ? toDecimal(subtotal).times(toDecimal(whtRate)).toFixed(4) : null;
  const netToReceive = whtAmount != null ? toDecimal(grandTotal).minus(toDecimal(whtAmount)).toFixed(4) : null;

  return (
    <div className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">{labels.subtotalLabel}</span>
        <MoneyCell value={subtotal} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">{labels.vatLabel}</span>
        <MoneyCell value={vatAmount} />
      </div>

      {onWhtRateChange && (
        <FormField label={labels.whtRateLabel} className="py-1">
          <Input
            type="number"
            step="0.000001"
            value={whtRate ?? ""}
            onChange={(e) => onWhtRateChange(e.target.value)}
            className="w-28"
          />
        </FormField>
      )}

      {hasWht ? (
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">{labels.whtAmountLabel}</span>
          <MoneyCell value={`-${whtAmount}`} />
        </div>
      ) : (
        !onWhtRateChange && <p className="text-caption text-text-muted">{labels.noWht}</p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-1 font-semibold">
        <span>{labels.grandTotalLabel}</span>
        <MoneyCell value={grandTotal} />
      </div>

      {hasWht && netToReceive && (
        <div className="mt-1 flex items-center justify-between rounded-md border border-accent bg-accent-subtle px-2 py-1.5 font-semibold text-accent-text">
          <span>{labels.netToReceiveLabel}</span>
          <MoneyCell value={netToReceive} className="text-accent-text" />
        </div>
      )}
    </div>
  );
}
