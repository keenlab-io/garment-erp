import * as React from "react";
import { Button, InkChip, Skeleton, cn, type ChipStatus } from "@erp/ui";

/** The three domains AlertsPanel unifies into one glance (design MD3). */
export type AlertSource = "stock" | "production" | "finance";

export interface ReportingAlert {
  id: string;
  source: AlertSource;
  /** The Ink-Chip status carrying the alert's meaning, e.g. `stock-near-min`, `delayed`, `overdue`. */
  status: ChipStatus;
  title: string;
  description?: string;
  /** Path to the source record; the screen owns navigation (e.g. via TanStack Router `Link`). */
  href: string;
}

export interface AlertsPanelLabels {
  empty: string;
  viewAction: string;
  /** The View button's accessible name — disambiguates it from every other alert's identical
   * `viewAction` text (WCAG 2.4.4 "Link Purpose"), e.g. `"View Cotton fabric — near minimum"`. */
  viewActionFor: (title: string) => string;
  source: (source: AlertSource) => string;
}

const DEFAULT_SOURCE_LABEL: Record<AlertSource, string> = {
  stock: "Stock",
  production: "Production",
  finance: "Finance",
};

const defaultLabels: AlertsPanelLabels = {
  empty: "No alerts — everything's on track.",
  viewAction: "View",
  viewActionFor: (title) => `View ${title}`,
  source: (source) => DEFAULT_SOURCE_LABEL[source],
};

export interface AlertsPanelProps {
  title: string;
  alerts: ReportingAlert[];
  /** Fired when an alert's View action is activated — the screen owns navigating to `alert.href`. */
  onSelect: (alert: ReportingAlert) => void;
  loading?: boolean;
  labels?: Partial<AlertsPanelLabels>;
  className?: string;
}

/**
 * The unified alerts panel (M6 §3.3, design MD3) — low-stock (M3), production delays (M4), and
 * overdue invoices (M5) in one glance, each an `InkChip`-tagged, actionable entry. Presentational
 * and router-agnostic: `onSelect` reports intent, the dashboard screen (M6 §4) owns navigation.
 */
export function AlertsPanel({
  title,
  alerts,
  onSelect,
  loading = false,
  labels: labelsProp,
  className,
}: AlertsPanelProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  return (
    <div className={cn("flex flex-col gap-3 rounded-md border border-border bg-bg-surface p-4", className)}>
      <h3 className="text-caption font-medium text-text-secondary">{title}</h3>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton variant="line" />
          <Skeleton variant="line" />
          <Skeleton variant="line" />
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-caption text-text-secondary">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-center gap-3 py-2">
              <InkChip status={alert.status} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-text-primary">{alert.title}</span>
                <span className="truncate text-caption text-text-secondary">
                  {labels.source(alert.source)}
                  {alert.description ? ` · ${alert.description}` : ""}
                </span>
              </div>
              <Button variant="ghost" onClick={() => onSelect(alert)} aria-label={labels.viewActionFor(alert.title)}>
                {labels.viewAction}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
