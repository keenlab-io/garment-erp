import * as React from "react";
import type { WorkOrderStep, WorkOrderStepStatus } from "@erp/contracts";
import { Button, chipMeta, cn } from "@erp/ui";
import { workOrderStepStatusToChip } from "../chip-status.js";
import { computeStepTiming } from "./step-drawer.js";

/**
 * Which of the two kiosk buttons a step's status allows (design MD2: "only the valid one enabled").
 * A step not yet started can only START; a running step can only FINISH; every other state (hold,
 * defect, outsourced, completed) disables both — the operator resolves it off the kiosk.
 */
export function resolveKioskActions(status: WorkOrderStepStatus): {
  startEnabled: boolean;
  finishEnabled: boolean;
} {
  return { startEnabled: status === "PENDING", finishEnabled: status === "IN_PROGRESS" };
}

export interface KioskCardLabels {
  elapsed: string;
  notStarted: string;
  minutes: string;
  start: string;
  finish: string;
  reportDefect: string;
}

const defaultLabels: KioskCardLabels = {
  elapsed: "Elapsed",
  notStarted: "Not started",
  minutes: "min",
  start: "▶ START",
  finish: "■ FINISH",
  reportDefect: "⚑ Report defect",
};

export interface KioskCardProps {
  woNo: string;
  customerLabel?: string;
  itemLabel: string;
  qty: string;
  unit?: string;
  step: WorkOrderStep;
  mockupUrl?: string | null;
  onStart: () => void | Promise<void>;
  onFinish: () => void | Promise<void>;
  /** Omit to hide the defect-report affordance (the screen owns the `DefectTilePicker` flow). */
  onReportDefect?: () => void;
  /** Injectable clock for the elapsed read; defaults to the live clock. */
  now?: Date;
  labels?: Partial<KioskCardLabels>;
  className?: string;
}

/**
 * The scan-station kiosk's work-order card (M4 §3.3, design MD2) — customer, item, qty, the
 * current step, a mockup thumbnail, and elapsed time, framed by exactly two giant buttons
 * (`▶ START` / `■ FINISH`, only the state-valid one enabled — huge, gloved-hand targets) and a
 * status edge color so a passing supervisor reads the step state across the room without reading
 * text. Presentational: the screen supplies the already-scanned work order and owns the mutations.
 */
export function KioskCard({
  woNo,
  customerLabel,
  itemLabel,
  qty,
  unit,
  step,
  mockupUrl,
  onStart,
  onFinish,
  onReportDefect,
  now,
  labels: labelsProp,
  className,
}: KioskCardProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const { startEnabled, finishEnabled } = resolveKioskActions(step.status);
  const timing = computeStepTiming(step, now);
  const edgeColor = chipMeta(workOrderStepStatusToChip(step.status, step.is_delayed)).swatch ?? undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border-t-8 border-border bg-bg-surface p-6 shadow-sm",
        className,
      )}
      style={{ borderTopColor: edgeColor }}
    >
      <div className="flex items-start gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-sunken">
          {mockupUrl ? (
            <img src={mockupUrl} alt={itemLabel} className="size-full object-cover" />
          ) : (
            <span aria-hidden className="text-2xl text-text-muted">
              —
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-mono text-body-strong text-text-link">{woNo}</span>
          <span className="truncate text-body-strong text-text-primary">
            {customerLabel ? `${customerLabel} · ` : ""}
            {itemLabel} × {qty}
            {unit ? ` ${unit}` : ""}
          </span>
          <span className="text-h2 font-bold uppercase tracking-wide text-text-primary">{step.name}</span>
          <span className="text-sm text-text-secondary">
            {labels.elapsed}: {timing.elapsedMin == null ? labels.notStarted : `${timing.elapsedMin} ${labels.minutes}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="primary"
          onClick={onStart}
          disabled={!startEnabled}
          className="min-h-32 text-h2 font-bold"
        >
          {labels.start}
        </Button>
        <Button
          variant="secondary"
          onClick={onFinish}
          disabled={!finishEnabled}
          className="min-h-32 text-h2 font-bold"
        >
          {labels.finish}
        </Button>
      </div>

      {onReportDefect && (
        <Button variant="ghost" onClick={onReportDefect} className="self-center">
          {labels.reportDefect}
        </Button>
      )}
    </div>
  );
}
