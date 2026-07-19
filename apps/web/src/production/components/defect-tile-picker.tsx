import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { toDecimal } from "@erp/utils";
import { Button, Icon, cn } from "@erp/ui";

export interface DefectType {
  id: string;
  label: string;
}

/** The defect types the wireframe names (spec §M4 "Misprint/Bad stitch/…") — a screen can override. */
export const DEFAULT_DEFECT_TYPES: DefectType[] = [
  { id: "misprint", label: "Misprint" },
  { id: "bad-stitch", label: "Bad stitch" },
  { id: "wrong-size", label: "Wrong size" },
  { id: "stain", label: "Stain" },
  { id: "torn", label: "Torn" },
  { id: "other", label: "Other" },
];

export interface DefectTilePickerLabels {
  qtyLabel: string;
  decrement: string;
  increment: string;
  submit: string;
}

const defaultLabels: DefectTilePickerLabels = {
  qtyLabel: "Qty",
  decrement: "Decrease quantity",
  increment: "Increase quantity",
  submit: "Report defect",
};

export interface DefectTilePickerProps {
  types?: DefectType[];
  /** Submits the selected tile's label (`RecordDefectRequest.type` is a free display string) and qty. */
  onSubmit: (type: string, qty: string) => void | Promise<void>;
  defaultQty?: string;
  qtyStep?: string;
  qtyMin?: string;
  labels?: Partial<DefectTilePickerLabels>;
  className?: string;
}

/**
 * The kiosk defect-report path (M4 §3.4, design MD2): large tiles pick the defect type — no
 * free text, gloved-hand sized — plus a qty stepper. Resets to no selection after a submit so the
 * operator's next defect starts clean.
 */
export function DefectTilePicker({
  types = DEFAULT_DEFECT_TYPES,
  onSubmit,
  defaultQty = "1",
  qtyStep = "1",
  qtyMin = "1",
  labels: labelsProp,
  className,
}: DefectTilePickerProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [selected, setSelected] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState(defaultQty);

  const step = (direction: 1 | -1) => {
    setQty((prev) => {
      const next = toDecimal(prev).plus(toDecimal(qtyStep).times(direction));
      const floor = toDecimal(qtyMin);
      return (next.lessThan(floor) ? floor : next).toString();
    });
  };

  const submit = async () => {
    const type = types.find((t) => t.id === selected);
    if (!type) return;
    await onSubmit(type.label, qty);
    setSelected(null);
    setQty(defaultQty);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            aria-pressed={selected === type.id}
            onClick={() => setSelected(type.id)}
            className={cn(
              "min-h-24 rounded-lg border-2 px-3 py-4 text-body-strong font-semibold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
              selected === type.id
                ? "border-accent bg-accent-subtle text-accent-text"
                : "border-border bg-bg-surface text-text-primary hover:bg-bg-sunken",
            )}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-text-secondary">{labels.qtyLabel}</span>
        <Button variant="icon" aria-label={labels.decrement} onClick={() => step(-1)}>
          <Icon icon={Minus} />
        </Button>
        <span className="min-w-[3ch] text-center text-body-strong tabular-nums">{qty}</span>
        <Button variant="icon" aria-label={labels.increment} onClick={() => step(1)}>
          <Icon icon={Plus} />
        </Button>
      </div>

      <Button onClick={submit} disabled={!selected} className="min-h-16 text-body-strong">
        {labels.submit}
      </Button>
    </div>
  );
}
