import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AuditEntry } from "@erp/contracts";
import { Button, InkChip, Skeleton, cn } from "@erp/ui";
import { BeforeAfterDiff, type BeforeAfterDiffLabels } from "./before-after-diff.js";
import { auditActionToChip } from "../status-chips.js";

export interface AuditTableLabels {
  timeColumn: string;
  actorColumn: string;
  actionColumn: string;
  entityColumn: string;
  reasonColumn: string;
  expand: string;
  collapse: string;
  system: string;
  empty: string;
  errorTitle: string;
  retry: string;
  previousPage: string;
  nextPage: string;
}

const defaultLabels: AuditTableLabels = {
  timeColumn: "Time",
  actorColumn: "Actor",
  actionColumn: "Action",
  entityColumn: "Entity",
  reasonColumn: "Reason",
  expand: "Show details",
  collapse: "Hide details",
  system: "System",
  empty: "No audit entries.",
  errorTitle: "Couldn't load the audit log.",
  retry: "Retry",
  previousPage: "Previous",
  nextPage: "Next",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface AuditTableProps {
  entries: AuditEntry[];
  isLoading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** Localizes an `AuditAction` code (e.g. "PERMISSION_CHANGE" → "Permission change"). */
  resolveActionLabel?: (action: string) => string;
  formatDateTime?: (iso: string) => string;
  nextCursor?: string | null;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  labels?: Partial<AuditTableLabels>;
  /** Forwarded to the row-expansion `BeforeAfterDiff`. */
  diffLabels?: Partial<BeforeAfterDiffLabels>;
  className?: string;
}

const defaultFormatDateTime = (iso: string) => new Date(iso).toLocaleString();

/**
 * The audit log's immutable table (M1 §4.4, MD4): a sunken surface with no row actions — rows expand
 * to the two-column `BeforeAfterDiff`. Shared by the full `audit-log-viewer` screen and the user-
 * detail "activity" section, so both stay in sync on presentation. Presentational: the screen owns
 * fetching, filters, and cursor pagination state.
 */
export function AuditTable({
  entries,
  isLoading = false,
  error = null,
  onRetry,
  resolveActionLabel = (action) => action,
  formatDateTime = defaultFormatDateTime,
  nextCursor,
  onNextPage,
  onPrevPage,
  labels: labelsProp,
  diffLabels,
  className,
}: AuditTableProps) {
  const labels = React.useMemo(() => ({ ...defaultLabels, ...labelsProp }), [labelsProp]);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex flex-col items-start gap-2 rounded-lg border border-danger bg-danger-subtle p-4", className)}>
        <p className="text-sm text-danger-on">{labels.errorTitle}</p>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {labels.retry}
          </Button>
        )}
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className={cn("text-sm text-text-muted", className)}>{labels.empty}</p>;
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-hidden rounded-lg border border-border bg-bg-sunken">
        <table role="grid" className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-8 px-2 py-2">
                <span className="sr-only">{labels.expand}</span>
              </th>
              <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.timeColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.actorColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.actionColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.entityColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.reasonColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isOpen = expanded[entry.id] ?? false;
              return (
                <React.Fragment key={entry.id}>
                  <tr className="border-b border-border last:border-b-0">
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? labels.collapse : labels.expand}
                        onClick={() => setExpanded((prev) => ({ ...prev, [entry.id]: !isOpen }))}
                        className="flex items-center justify-center rounded-sm text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        {isOpen ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{formatDateTime(entry.at)}</td>
                    <td className="px-3 py-2 font-mono text-mono text-text-secondary">
                      {entry.actor_user_id ?? labels.system}
                    </td>
                    <td className="px-3 py-2">
                      <InkChip status={auditActionToChip(entry.action)} label={resolveActionLabel(entry.action)} />
                    </td>
                    <td className="px-3 py-2 text-text-primary">
                      {entry.entity_type}
                      {entry.entity_id ? ` · ${entry.entity_id}` : ""}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{entry.reason ?? "—"}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={6} className="bg-bg-surface p-3">
                        <BeforeAfterDiff
                          before={asRecord(entry.before)}
                          after={asRecord(entry.after)}
                          labels={diffLabels}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {(onNextPage || onPrevPage) && (
        <div className="flex items-center justify-end gap-2">
          {onPrevPage && (
            <Button variant="secondary" onClick={onPrevPage}>
              {labels.previousPage}
            </Button>
          )}
          {onNextPage && (
            <Button variant="secondary" onClick={onNextPage} disabled={!nextCursor}>
              {labels.nextPage}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
