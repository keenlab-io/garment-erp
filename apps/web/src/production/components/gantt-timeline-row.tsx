import * as React from "react";
import type { WorkOrderStep, WorkOrderTimelineEntry } from "@erp/contracts";
import { InkChip, cn } from "@erp/ui";
import { workOrderStepStatusToChip } from "../chip-status.js";

export interface GanttTimelineRowLabels {
  dueLabel: string;
  emptySteps: string;
}

const defaultLabels: GanttTimelineRowLabels = {
  dueLabel: "Due",
  emptySteps: "No steps",
};

const defaultFormatDueDate = (iso: string) => new Date(iso).toLocaleDateString();

export interface GanttTimelineRowProps {
  entry: WorkOrderTimelineEntry;
  /** Resolved display name for `entry.customer_id` — the row never fetches; the screen owns joins. */
  customerLabel?: string;
  /** Step ids mid soft-animation from a live update (`useProductionRealtimeSync`'s `pulsingStepIds`). */
  pulsingStepIds?: ReadonlySet<string>;
  onStepClick?: (step: WorkOrderStep, entry: WorkOrderTimelineEntry) => void;
  formatDueDate?: (isoDate: string) => string;
  labels?: Partial<GanttTimelineRowLabels>;
  className?: string;
}

/**
 * One work-order row of the Gantt timeline (M4 §3.1, design MD1) — steps render as click-to-open
 * status bars sized by their `standard_time_min` share of the work order, each an `InkChip` (color
 * + dot glyph + label — legible without color, spec "Steps are identifiable without color"). A
 * step id present in `pulsingStepIds` (set by the realtime sync hook on a live floor scan) gets a
 * soft pulse so the update visibly lands.
 */
export function GanttTimelineRow({
  entry,
  customerLabel,
  pulsingStepIds,
  onStepClick,
  formatDueDate = defaultFormatDueDate,
  labels: labelsProp,
  className,
}: GanttTimelineRowProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const totalMin = entry.steps.reduce((sum, step) => sum + Math.max(step.standard_time_min, 1), 0) || 1;

  return (
    <div className={cn("flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0", className)}>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-mono text-sm text-text-link">{entry.wo_no}</span>
        {customerLabel && <span className="text-sm text-text-secondary">{customerLabel}</span>}
        {entry.due_date && (
          <span className="ml-auto shrink-0 text-caption text-text-muted">
            {labels.dueLabel} {formatDueDate(entry.due_date)}
          </span>
        )}
      </div>

      {entry.steps.length === 0 ? (
        <p className="text-sm text-text-muted">{labels.emptySteps}</p>
      ) : (
        <div className="flex items-stretch gap-0.5">
          {entry.steps.map((step) => {
            const pulsing = pulsingStepIds?.has(step.id) ?? false;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onStepClick?.(step, entry)}
                title={step.name}
                aria-label={step.name}
                className={cn(
                  "flex min-w-[2.5rem] flex-col items-center gap-0.5 rounded-sm border border-transparent px-1 py-1.5",
                  "hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                  pulsing && "animate-pulse",
                )}
                style={{ flexGrow: Math.max(step.standard_time_min, 1) / totalMin }}
              >
                <InkChip status={workOrderStepStatusToChip(step.status, step.is_delayed)} />
                <span className="truncate text-caption text-text-muted">{step.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
