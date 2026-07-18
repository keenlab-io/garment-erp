import * as React from "react";
import { cn } from "@erp/ui";

export interface BeforeAfterDiffLabels {
  beforeHeading: string;
  afterHeading: string;
  emptyValue: string;
  noChanges: string;
}

const defaultLabels: BeforeAfterDiffLabels = {
  beforeHeading: "Before",
  afterHeading: "After",
  emptyValue: "—",
  noChanges: "No field changes recorded.",
};

export interface BeforeAfterDiffProps {
  /** The audit entry's `before` snapshot (null for a create). */
  before: Record<string, unknown> | null;
  /** The audit entry's `after` snapshot (null for a delete). */
  after: Record<string, unknown> | null;
  labels?: Partial<BeforeAfterDiffLabels>;
  className?: string;
}

function formatValue(value: unknown, empty: string): string {
  if (value === null || value === undefined) return empty;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

interface DiffField {
  key: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

function buildFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffField[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys]
    .sort()
    .map((key) => {
      const beforeValue = before ? before[key] : undefined;
      const afterValue = after ? after[key] : undefined;
      return { key, before: beforeValue, after: afterValue, changed: !valuesEqual(beforeValue, afterValue) };
    });
}

/**
 * The audit log's two-column before/after diff (MD4): every field present in either snapshot gets a
 * row, changed rows are highlighted. Presentational — the audit-log-viewer screen (M1 §4.4) supplies
 * the entry's `before`/`after` and owns row expansion.
 */
export function BeforeAfterDiff({ before, after, labels: labelsProp, className }: BeforeAfterDiffProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const fields = React.useMemo(() => buildFields(before, after), [before, after]);

  if (fields.length === 0) {
    return <p className={cn("text-sm text-text-muted", className)}>{labels.noChanges}</p>;
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
      <div className="grid grid-cols-2 border-b border-border bg-bg-sunken text-caption font-semibold uppercase tracking-wide text-text-muted">
        <div className="border-r border-border px-3 py-2">{labels.beforeHeading}</div>
        <div className="px-3 py-2">{labels.afterHeading}</div>
      </div>
      {fields.map((field) => (
        <div
          key={field.key}
          className={cn(
            "grid grid-cols-2 border-b border-border text-sm last:border-b-0",
            field.changed && "bg-warning-subtle",
          )}
        >
          <div className="border-r border-border px-3 py-2">
            <div className="text-caption text-text-muted">{field.key}</div>
            <div className="text-text-primary">{formatValue(field.before, labels.emptyValue)}</div>
          </div>
          <div className="px-3 py-2">
            <div className="text-caption text-text-muted">{field.key}</div>
            <div className={cn("text-text-primary", field.changed && "font-semibold")}>
              {formatValue(field.after, labels.emptyValue)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
