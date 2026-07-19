import * as React from "react";
import { allocate, divideMoney, formatMoney, lineTotal, toDecimal } from "@erp/utils";
import { AllocMethod } from "@erp/contracts";
import { FormField, Input, MaskedValue, MoneyCell, QtyCell, Radio, RadioGroup, cn } from "@erp/ui";

export interface LandedCostLine {
  id: string;
  itemLabel: string;
  /** Received quantity, in the receiving UOM. */
  qty: string;
  /** Unit price the operator entered for this line — never masked, it's their own input. */
  unitPrice: string;
  /** Unit weight, for the `WEIGHT` allocation method. */
  unitWeight?: string | null;
}

interface LandedCostPreviewRow {
  line: LandedCostLine;
  allocatedLanded: string;
  newUnitCost: string;
}

/** The per-line weight the freight total is split by, for each allocation method. */
function lineWeight(line: LandedCostLine, method: AllocMethod): string {
  switch (method) {
    case AllocMethod.WEIGHT:
      return toDecimal(line.qty).times(toDecimal(line.unitWeight ?? "0")).toString();
    case AllocMethod.QTY:
      return line.qty;
    case AllocMethod.VALUE:
    default:
      return lineTotal(line.qty, line.unitPrice);
  }
}

function buildPreview(lines: LandedCostLine[], method: AllocMethod, freightTotal: string): LandedCostPreviewRow[] {
  if (lines.length === 0) return [];
  const weights = lines.map((line) => lineWeight(line, method));
  const allocated = allocate(freightTotal, weights);
  return lines.map((line, index) => {
    const allocatedLanded = allocated[index] ?? "0.0000";
    const perUnitLanded = toDecimal(line.qty).isZero() ? "0.0000" : divideMoney(allocatedLanded, line.qty);
    return {
      line,
      allocatedLanded,
      newUnitCost: formatMoney(toDecimal(line.unitPrice).plus(toDecimal(perUnitLanded))),
    };
  });
}

export interface LandedCostAllocatorLabels {
  methodLabel: string;
  methodValue: string;
  methodWeight: string;
  methodQty: string;
  freightLabel: string;
  itemColumn: string;
  qtyColumn: string;
  allocatedColumn: string;
  unitCostColumn: string;
  totalLabel: string;
}

const defaultLabels: LandedCostAllocatorLabels = {
  methodLabel: "Allocation method",
  methodValue: "By value",
  methodWeight: "By weight",
  methodQty: "By quantity",
  freightLabel: "Freight / import total",
  itemColumn: "Item",
  qtyColumn: "Qty",
  allocatedColumn: "Allocated landed cost",
  unitCostColumn: "New unit cost",
  totalLabel: "Total allocated",
};

export interface LandedCostAllocatorProps {
  lines: LandedCostLine[];
  method: AllocMethod;
  onMethodChange: (method: AllocMethod) => void;
  freightTotal: string;
  onFreightTotalChange: (value: string) => void;
  labels?: Partial<LandedCostAllocatorLabels>;
  className?: string;
}

/**
 * The landed-cost allocator (M3 §3.4, design MD3) — a method selector (value / weight / qty) and a
 * freight/import total that drive a **live** per-line cost-impact preview, computed client-side with
 * `@erp/utils#allocate` (the same proportional-split + remainder-reconciliation math the backend
 * uses at `confirmGoodsReceipt`, since the contract has no dry-run endpoint). Allocated cost and the
 * resulting unit cost are masked without `inventory.cost.view`; the operator's own qty/unit-price
 * input is never masked.
 */
export function LandedCostAllocator({
  lines,
  method,
  onMethodChange,
  freightTotal,
  onFreightTotalChange,
  labels: labelsProp,
  className,
}: LandedCostAllocatorProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const preview = React.useMemo(() => buildPreview(lines, method, freightTotal), [lines, method, freightTotal]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-text-primary">{labels.methodLabel}</legend>
          <RadioGroup
            value={method}
            onValueChange={(value) => onMethodChange(value as AllocMethod)}
            aria-label={labels.methodLabel}
            className="flex-row gap-4"
          >
            {(
              [
                [AllocMethod.VALUE, labels.methodValue],
                [AllocMethod.WEIGHT, labels.methodWeight],
                [AllocMethod.QTY, labels.methodQty],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-text-primary">
                <Radio value={value} /> {label}
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        <FormField label={labels.freightLabel} className="max-w-48">
          <Input
            type="number"
            value={freightTotal}
            onChange={(event) => onFreightTotalChange(event.target.value)}
          />
        </FormField>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-bg-sunken">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.itemColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.qtyColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.allocatedColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.unitCostColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.map(({ line, allocatedLanded, newUnitCost }) => (
              <tr key={line.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 text-text-primary">{line.itemLabel}</td>
                <td className="px-3 py-2 text-right">
                  <QtyCell value={line.qty} />
                </td>
                <td className="px-3 py-2 text-right">
                  <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={allocatedLanded} />} />
                </td>
                <td className="px-3 py-2 text-right">
                  <MaskedValue permission="inventory.cost.view" value={<MoneyCell value={newUnitCost} />} />
                </td>
              </tr>
            ))}
          </tbody>
          {preview.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="px-3 py-2 text-text-primary" colSpan={2}>
                  {labels.totalLabel}
                </td>
                <td className="px-3 py-2 text-right" colSpan={2}>
                  <MaskedValue
                    permission="inventory.cost.view"
                    value={<MoneyCell value={formatMoney(freightTotal || "0")} />}
                  />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
