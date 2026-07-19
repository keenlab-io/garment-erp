import * as React from "react";
import { Camera, Minus, Plus, Undo2 } from "lucide-react";
import { toDecimal } from "@erp/utils";
import { cn } from "../../lib/cn.js";
import { Icon } from "../icon/icon.js";
import { Button } from "../button/button.js";
import { Input } from "../input/input.js";

export interface ScanEntry {
  id: string;
  code: string;
  qty: string;
}

export interface ScanFieldLabels {
  placeholder: string;
  qtyLabel: string;
  addButton: string;
  cameraButton: string;
  undo: string;
  lastScans: string;
  decrement: string;
  increment: string;
}

const defaultLabels: ScanFieldLabels = {
  placeholder: "Scan or enter a code",
  qtyLabel: "Qty",
  addButton: "Add",
  cameraButton: "Scan with camera",
  undo: "Undo",
  lastScans: "Last scans",
  decrement: "Decrease quantity",
  increment: "Increase quantity",
};

export interface ScanFieldProps {
  /** The committed scan log, most recent first — the caller owns this list (append on `onScan`, pop
   * on `onUndo`); only the most recent 5 are rendered. */
  recentScans: ScanEntry[];
  /** A code is committed (Enter, the Add button, or a decoded camera scan) with the current quantity. */
  onScan: (code: string, qty: string) => void;
  /** Remove a previously committed scan (typically the most recent one). */
  onUndo: (id: string) => void;
  /** The camera-trigger button was pressed — the host wires the actual barcode decoding and then
   * calls its own `onScan` once a code resolves; the field itself never decodes an image. */
  onCameraScan?: () => void;
  /** Starting quantity for a fresh scan. Default `"1"`. */
  defaultQty?: string;
  /** Quantity stepper increment. Default `"1"`. */
  qtyStep?: string;
  /** Quantity floor — the stepper never decrements below this. Default `"0"`. */
  qtyMin?: string;
  unit?: string;
  labels?: Partial<ScanFieldLabels>;
  className?: string;
  autoFocus?: boolean;
}

/**
 * The shared scan-field primitive (M3 §3.2, design MD2/MD6) — a persistent code input for
 * handheld HID scanners (keystroke-wedge + Enter) with a qty stepper, an optional camera trigger,
 * and a last-5 scan log with per-entry undo. M3 owns it for scan-first goods issue; M4 reuses it
 * for the kiosk routing-card scan. Presentational: the caller owns the scan log and posts.
 * Refocuses the code input after every commit so the handheld loop never needs a tap back in.
 */
export function ScanField({
  recentScans,
  onScan,
  onUndo,
  onCameraScan,
  defaultQty = "1",
  qtyStep = "1",
  qtyMin = "0",
  unit,
  labels: labelsProp,
  className,
  autoFocus = true,
}: ScanFieldProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [code, setCode] = React.useState("");
  const [qty, setQty] = React.useState(defaultQty);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const commit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    onScan(trimmed, qty);
    setCode("");
    inputRef.current?.focus();
  };

  const step = (direction: 1 | -1) => {
    setQty((prev) => {
      const next = toDecimal(prev).plus(toDecimal(qtyStep).times(direction));
      const floor = toDecimal(qtyMin);
      return (next.lessThan(floor) ? floor : next).toString();
    });
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-end gap-2">
        <Input
          ref={inputRef}
          autoFocus={autoFocus}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          className="flex-1"
        />
        {onCameraScan && (
          <Button variant="icon" aria-label={labels.cameraButton} onClick={onCameraScan}>
            <Icon icon={Camera} />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-text-secondary">{labels.qtyLabel}</span>
        <div className="flex items-center gap-1">
          <Button variant="icon" aria-label={labels.decrement} onClick={() => step(-1)}>
            <Icon icon={Minus} />
          </Button>
          <Input
            type="number"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            aria-label={labels.qtyLabel}
            className="w-24 text-center"
          />
          <Button variant="icon" aria-label={labels.increment} onClick={() => step(1)}>
            <Icon icon={Plus} />
          </Button>
          {unit && <span className="text-sm text-text-muted">{unit}</span>}
        </div>
        <Button onClick={commit} disabled={!code.trim()} className="ml-auto">
          {labels.addButton}
        </Button>
      </div>

      {recentScans.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-caption uppercase tracking-wide text-text-muted">{labels.lastScans}</h3>
          <ul className="flex flex-col gap-1">
            {recentScans.slice(0, 5).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg-surface px-3 py-2 text-sm"
                style={{ minHeight: "var(--density-tap-min)" }}
              >
                <span className="font-mono text-mono text-text-link">{entry.code}</span>
                <span className="text-text-secondary">
                  {entry.qty}
                  {unit ? ` ${unit}` : ""}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => onUndo(entry.id)}
                  className="gap-1 text-text-secondary"
                >
                  <Icon icon={Undo2} size={14} />
                  {labels.undo}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
