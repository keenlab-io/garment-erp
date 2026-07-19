import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { WorkOrderStep, WorkOrderTimelineEntry } from "@erp/contracts";
import { Icon, InkChip, cn, type ChipStatus } from "@erp/ui";

export interface AlertRailAlert {
  id: string;
  title: string;
  detail: string;
  chipStatus: ChipStatus;
  onClick?: () => void;
}

/**
 * Builds one alert per delayed step across the timeline feed (M4 §3.1) — the join from step to its
 * parent work order (for the `"WO-114 · Sew"` title) only needs the same entry, so it lives here
 * rather than asking every caller to repeat it. Overdue-subcontract alerts need a `wo_step_id` →
 * work-order join the timeline feed doesn't carry, so a screen builds those `AlertRailAlert`s itself
 * and concatenates them with this list.
 */
export function deriveDelayedStepAlerts(
  entries: readonly WorkOrderTimelineEntry[],
  formatDetail: (step: WorkOrderStep, entry: WorkOrderTimelineEntry) => string = (step) =>
    `${step.name} is running over its ${step.standard_time_min}m standard`,
): AlertRailAlert[] {
  const alerts: AlertRailAlert[] = [];
  for (const entry of entries) {
    for (const step of entry.steps) {
      if (!step.is_delayed) continue;
      alerts.push({
        id: step.id,
        title: `${entry.wo_no} · ${step.name}`,
        detail: formatDetail(step, entry),
        chipStatus: "delayed",
      });
    }
  }
  return alerts;
}

export interface AlertRailLabels {
  title: string;
  empty: string;
}

const defaultLabels: AlertRailLabels = {
  title: "Alerts",
  empty: "No active alerts",
};

export interface AlertRailProps {
  alerts: AlertRailAlert[];
  labels?: Partial<AlertRailLabels>;
  className?: string;
}

/**
 * The timeline's alert rail (M4 §3.1, design MD1) — delayed steps and overdue subcontract SLAs in
 * one list, so the lead spots what needs attention without scanning every bar. `aria-live="polite"`
 * announces new alerts as they arrive (WCAG live-region requirement, M4 §5.2); each row states the
 * problem in text, never color alone.
 */
export function AlertRail({ alerts, labels: labelsProp, className }: AlertRailProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-3", className)}
      role="region"
      aria-label={labels.title}
    >
      <div className="flex items-center gap-2">
        <Icon icon={AlertTriangle} className="text-danger" aria-hidden />
        <h2 className="text-sm font-semibold text-text-primary">
          {labels.title} ({alerts.length})
        </h2>
      </div>

      {alerts.length === 0 ? (
        <p className="text-sm text-text-muted">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-live="polite">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <button
                type="button"
                onClick={alert.onClick}
                disabled={!alert.onClick}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-bg-sunken disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-text-primary">{alert.title}</span>
                  <span className="truncate text-caption text-text-secondary">{alert.detail}</span>
                </span>
                <InkChip status={alert.chipStatus} className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
