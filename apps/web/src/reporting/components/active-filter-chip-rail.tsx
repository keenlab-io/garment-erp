import * as React from "react";
import { X } from "lucide-react";
import { Badge, Button, Icon, cn } from "@erp/ui";

/** One active dashboard/report filter, rendered as a removable pill. */
export interface ActiveFilterChip {
  /** Stable identity for removal, e.g. the filter's dimension key. */
  key: string;
  /** Rendered chip text, e.g. "Month: 2026-01" or "Customer: Acme Co." */
  label: string;
}

export interface ActiveFilterChipRailLabels {
  clear: string;
  remove: (label: string) => string;
}

const defaultLabels: ActiveFilterChipRailLabels = {
  clear: "Clear",
  remove: (label) => `Remove filter: ${label}`,
};

export interface ActiveFilterChipRailProps {
  chips: ActiveFilterChip[];
  /** Removes a single chip; omit to only offer "Clear all". */
  onRemove?: (key: string) => void;
  onClear: () => void;
  labels?: Partial<ActiveFilterChipRailLabels>;
  className?: string;
}

/**
 * The active-filter chip rail (M6 §3.3, design MD1) — the currently applied cross-filter slice,
 * always visible above a dashboard's panels ("visibility of system status"). Renders nothing when
 * no filter is applied, so it never occupies space on an unfiltered dashboard.
 */
export function ActiveFilterChipRail({
  chips,
  onRemove,
  onClear,
  labels: labelsProp,
  className,
}: ActiveFilterChipRailProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} role="group" aria-label={labels.clear}>
      {chips.map((chip) => (
        <Badge key={chip.key} tone="accent" className="gap-1.5 py-1 pr-1.5">
          {chip.label}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(chip.key)}
              aria-label={labels.remove(chip.label)}
              className="inline-flex items-center rounded-full p-0.5 hover:bg-accent-subtle"
            >
              <Icon icon={X} size={12} />
            </button>
          )}
        </Badge>
      ))}
      <Button variant="ghost" onClick={onClear}>
        {labels.clear}
      </Button>
    </div>
  );
}
