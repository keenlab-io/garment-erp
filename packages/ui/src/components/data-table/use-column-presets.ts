import * as React from "react";
import type {
  OnChangeFn,
  SortingState,
  Updater,
  VisibilityState,
} from "@tanstack/react-table";

/** The column arrangement a preset persists: which columns show, their order, and the sort. */
export interface ColumnPresetState {
  columnVisibility: VisibilityState;
  columnOrder: string[];
  sorting: SortingState;
}

/** The live preset state plus TanStack-shaped change handlers and save/reset controls. */
export interface ColumnPresetsApi extends ColumnPresetState {
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  onColumnOrderChange: OnChangeFn<string[]>;
  onSortingChange: OnChangeFn<SortingState>;
  /** Persist the current arrangement for this table id. No-op without a table id. */
  savePreset: () => void;
  /** Forget the saved arrangement and revert to defaults (all visible, natural order, no sort). */
  resetPreset: () => void;
  /** True when a table id is set, so save/reset can persist to this client. */
  canPersist: boolean;
}

const EMPTY: ColumnPresetState = { columnVisibility: {}, columnOrder: [], sorting: [] };

function readPreset(storageKey: string | null): Partial<ColumnPresetState> {
  if (!storageKey || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Partial<ColumnPresetState>) : {};
  } catch {
    return {};
  }
}

function applyUpdater<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === "function" ? (updater as (p: T) => T)(previous) : updater;
}

/**
 * Column presets for one table identity, persisted client-side (localStorage) so a user's hidden
 * columns, order, and sort survive a reload. Pass a stable `tableId` to enable persistence; without
 * one the arrangement is in-memory only. Server-side saved views are a later module concern.
 */
export interface UseColumnPresetsOptions {
  storagePrefix?: string;
  /** Initial arrangement when no saved preset exists (a stored preset always wins). */
  defaults?: Partial<ColumnPresetState>;
}

export function useColumnPresets(
  tableId?: string,
  { storagePrefix = "erp.table-preset", defaults }: UseColumnPresetsOptions = {},
): ColumnPresetsApi {
  const storageKey = tableId ? `${storagePrefix}:${tableId}` : null;

  const [state, setState] = React.useState<ColumnPresetState>(() => {
    const stored = readPreset(storageKey);
    return {
      columnVisibility: stored.columnVisibility ?? defaults?.columnVisibility ?? EMPTY.columnVisibility,
      columnOrder: stored.columnOrder ?? defaults?.columnOrder ?? EMPTY.columnOrder,
      sorting: stored.sorting ?? defaults?.sorting ?? EMPTY.sorting,
    };
  });

  const onColumnVisibilityChange: OnChangeFn<VisibilityState> = (updater) =>
    setState((s) => ({ ...s, columnVisibility: applyUpdater(updater, s.columnVisibility) }));

  const onColumnOrderChange: OnChangeFn<string[]> = (updater) =>
    setState((s) => ({ ...s, columnOrder: applyUpdater(updater, s.columnOrder) }));

  const onSortingChange: OnChangeFn<SortingState> = (updater) =>
    setState((s) => ({ ...s, sorting: applyUpdater(updater, s.sorting) }));

  const savePreset = React.useCallback(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* storage unavailable — nothing to persist */
    }
  }, [storageKey, state]);

  const resetPreset = React.useCallback(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* storage unavailable — nothing to clear */
      }
    }
    setState(EMPTY);
  }, [storageKey]);

  return {
    ...state,
    onColumnVisibilityChange,
    onColumnOrderChange,
    onSortingChange,
    savePreset,
    resetPreset,
    canPersist: storageKey != null,
  };
}
