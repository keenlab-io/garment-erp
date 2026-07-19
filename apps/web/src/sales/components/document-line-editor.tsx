import * as React from "react";
import type { DocLineInput } from "@erp/contracts";
import { asMoney, asQty } from "@erp/contracts";
import { Button, Combobox, type ComboboxOption, FormField, Input, MoneyCell, cn } from "@erp/ui";
import { lineTotal } from "../totals.js";

/** A `DocLineInput` plus a client-only key — the contract has no line id until the document is saved. */
export interface DocumentLineEditorLine extends DocLineInput {
  id: string;
}

/** A fresh, empty line for "add line" — qty defaults to 1 so the total is never a stray zero row. */
export function emptyDocumentLine(): DocumentLineEditorLine {
  return { id: crypto.randomUUID(), description: "", qty: asQty("1"), unit_price: asMoney("0.00") };
}

export interface DocumentLineEditorLabels {
  itemLabel: string;
  itemPlaceholder: string;
  itemSearchPlaceholder: string;
  descriptionLabel: string;
  qtyLabel: string;
  unitPriceLabel: string;
  discountLabel: string;
  totalLabel: string;
  addLine: string;
  removeLine: string;
}

const defaultLabels: DocumentLineEditorLabels = {
  itemLabel: "Item",
  itemPlaceholder: "Look up an item…",
  itemSearchPlaceholder: "Search items…",
  descriptionLabel: "Description",
  qtyLabel: "Qty",
  unitPriceLabel: "Unit price",
  discountLabel: "Discount",
  totalLabel: "Total",
  addLine: "+ Add line",
  removeLine: "Remove",
};

export interface DocumentLineEditorProps {
  lines: DocumentLineEditorLine[];
  onLinesChange: (lines: DocumentLineEditorLine[]) => void;
  /** Item lookup options (M5 §3.1 "item lookup") — the parent owns fetching, same shape as the
   * inventory item combobox. */
  itemOptions?: ComboboxOption[];
  itemLoading?: boolean;
  onItemSearchChange?: (query: string) => void;
  labels?: Partial<DocumentLineEditorLabels>;
  className?: string;
}

/**
 * The document line-item editor (M5 §3.1, design MD1) — item lookup + qty + unit price + discount,
 * with a live per-line total (`qty × unit_price − discount`, computed client-side via
 * `sales/totals.ts#lineTotal`, the same math the server persists). Picking an item only fills a
 * still-blank description (the contract's `item_id` and `description` are independent fields —
 * a free-text line with no `item_id` is valid, e.g. a service line).
 */
export function DocumentLineEditor({
  lines,
  onLinesChange,
  itemOptions = [],
  itemLoading = false,
  onItemSearchChange,
  labels: labelsProp,
  className,
}: DocumentLineEditorProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  function updateLine(id: string, patch: Partial<DocumentLineEditorLine>) {
    onLinesChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    onLinesChange(lines.filter((line) => line.id !== id));
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {lines.map((line) => (
        <div key={line.id} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
          <FormField label={labels.itemLabel} className="min-w-48 flex-1">
            <Combobox
              value={line.item_id ?? ""}
              onValueChange={(itemId) => {
                const option = itemOptions.find((o) => o.value === itemId);
                updateLine(line.id, {
                  item_id: itemId || undefined,
                  description: line.description || option?.label || line.description,
                });
              }}
              onSearchChange={onItemSearchChange}
              loading={itemLoading}
              options={itemOptions}
              placeholder={labels.itemPlaceholder}
              searchPlaceholder={labels.itemSearchPlaceholder}
              aria-label={labels.itemLabel}
            />
          </FormField>
          <FormField label={labels.descriptionLabel} className="min-w-40 flex-[2]">
            <Input
              value={line.description}
              onChange={(e) => updateLine(line.id, { description: e.target.value })}
            />
          </FormField>
          <FormField label={labels.qtyLabel}>
            <Input
              type="number"
              value={line.qty}
              onChange={(e) => updateLine(line.id, { qty: asQty(e.target.value) })}
              className="w-24"
            />
          </FormField>
          <FormField label={labels.unitPriceLabel}>
            <Input
              type="number"
              step="0.0001"
              value={line.unit_price}
              onChange={(e) => updateLine(line.id, { unit_price: asMoney(e.target.value) })}
              className="w-28"
            />
          </FormField>
          <FormField label={labels.discountLabel}>
            <Input
              type="number"
              step="0.0001"
              value={line.discount ?? ""}
              onChange={(e) => updateLine(line.id, { discount: e.target.value ? asMoney(e.target.value) : undefined })}
              className="w-24"
            />
          </FormField>
          <div className="flex w-28 flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">{labels.totalLabel}</span>
            <MoneyCell value={lineTotal(line)} className="pt-1.5" />
          </div>
          <Button type="button" variant="ghost" onClick={() => removeLine(line.id)} disabled={lines.length === 1}>
            {labels.removeLine}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => onLinesChange([...lines, emptyDocumentLine()])}
        className="self-start"
      >
        {labels.addLine}
      </Button>
    </div>
  );
}
