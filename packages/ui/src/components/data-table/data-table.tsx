import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type Table,
} from "@tanstack/react-table";
import * as Popover from "@radix-ui/react-popover";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  MoreHorizontal,
  RotateCw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import type { Density } from "@erp/design-tokens";
import { cn } from "../../lib/cn.js";
import { Button } from "../button/button.js";
import { Checkbox } from "../checkbox/checkbox.js";
import { Skeleton } from "../skeleton/skeleton.js";
import { useColumnPresets } from "./use-column-presets.js";

/** A bulk action shown in the selection bar; receives the currently selected rows on click. */
export interface BulkAction<TData> {
  key: string;
  label: string;
  onClick: (rows: TData[]) => void;
}

/** A per-row action shown in the row's overflow menu. */
export interface RowAction {
  key: string;
  label: string;
  onClick: () => void;
  /** Weight the item in danger ink (e.g. delete/void). */
  destructive?: boolean;
}

/** The zero-rows slot: a one-line explanation and an optional primary action. */
export interface DataTableEmptyState {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** All user-facing strings, overridable so the app can pass localized labels (i18n lands in M0 §7). */
export interface DataTableLabels {
  selectAll: string;
  selectRow: string;
  selected: (count: number) => string;
  clearSelection: string;
  columns: string;
  savePreset: string;
  resetPreset: string;
  previousPage: string;
  nextPage: string;
  endOfList: string;
  rowActions: string;
  retry: string;
  errorTitle: string;
}

const DEFAULT_LABELS: DataTableLabels = {
  selectAll: "Select all rows",
  selectRow: "Select row",
  selected: (count) => `${count} selected`,
  clearSelection: "Clear",
  columns: "Columns",
  savePreset: "Save view",
  resetPreset: "Reset",
  previousPage: "Previous",
  nextPage: "Next",
  endOfList: "End of list",
  rowActions: "Row actions",
  retry: "Retry",
  errorTitle: "Couldn't load this list",
};

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  /** Stable row identity — enables selection to survive re-fetches and sorting. */
  getRowId?: (row: TData, index: number) => string;
  /** Table identity; enables client-persisted column presets (visibility/order/sort). */
  tableId?: string;
  /** Active density. Only drives behavior (Touch hides `secondary` columns); sizing is token-driven. */
  density?: Density;

  // Sorting — the table owns sort state and emits it for a server data layer to apply.
  defaultSorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Skip client-side sorting because the data layer sorts server-side. */
  manualSorting?: boolean;

  // Cursor pagination — the parent owns fetching; the table renders Prev/Next and emits intent.
  nextCursor?: string | null;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  /** Left-aligned footer label, e.g. "248 items". */
  totalLabel?: string;

  // Selection + bulk actions.
  enableSelection?: boolean;
  bulkActions?: BulkAction<TData>[];

  // Per-row actions (overflow menu).
  rowActions?: (row: TData) => RowAction[];

  // States.
  isLoading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  emptyState?: DataTableEmptyState;

  // Slots.
  /** Left side of the toolbar — a search/filter bar. The Columns menu sits on the right. */
  toolbar?: React.ReactNode;
  labels?: Partial<DataTableLabels>;
  /** Bound the scroll region so the sticky header pins; omit to scroll with the page. */
  maxBodyHeight?: number | string;
}

const SELECT_COL = "__select";
const ACTIONS_COL = "__actions";
const SKELETON_ROWS = 6;

/**
 * The one shared list table every module screen uses — TanStack Table (headless) rendered through the
 * locked semantic tokens. Sticky sortable header, cursor Prev/Next pagination, density-aware rows
 * (Touch drops `secondary` columns), row + bulk actions, client-persisted column presets, and
 * skeleton / empty / error states. Presentational: the parent owns data fetching and cursor state.
 */
export function DataTable<TData>({
  data,
  columns,
  getRowId,
  tableId,
  density = "comfortable",
  defaultSorting = [],
  onSortingChange,
  manualSorting = false,
  nextCursor,
  onNextPage,
  onPrevPage,
  totalLabel,
  enableSelection = false,
  bulkActions,
  rowActions,
  isLoading = false,
  error,
  onRetry,
  emptyState,
  toolbar,
  labels: labelsProp,
  maxBodyHeight,
}: DataTableProps<TData>) {
  const labels = React.useMemo(() => ({ ...DEFAULT_LABELS, ...labelsProp }), [labelsProp]);
  const isTouch = density === "touch";

  const presets = useColumnPresets(tableId, { defaults: { sorting: defaultSorting } });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);
  const [activeRow, setActiveRow] = React.useState<number>(0);

  // Touch forces `secondary` columns hidden on top of the user's visibility preset.
  const secondaryColumnIds = React.useMemo(
    () =>
      columns
        .filter((c) => c.meta?.secondary)
        .map((c) => c.id)
        .filter((id): id is string => Boolean(id)),
    [columns],
  );
  const columnVisibility = React.useMemo(() => {
    if (!isTouch || secondaryColumnIds.length === 0) return presets.columnVisibility;
    const forced = { ...presets.columnVisibility };
    for (const id of secondaryColumnIds) forced[id] = false;
    return forced;
  }, [isTouch, secondaryColumnIds, presets.columnVisibility]);

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next =
      typeof updater === "function" ? updater(presets.sorting) : updater;
    presets.onSortingChange(next);
    onSortingChange?.(next);
  };

  const tableColumns = React.useMemo<ColumnDef<TData>[]>(() => {
    const cols: ColumnDef<TData>[] = [];
    if (enableSelection) {
      cols.push({
        id: SELECT_COL,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={labels.selectAll}
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={labels.selectRow}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
          />
        ),
      });
    }
    cols.push(...columns);
    if (rowActions) {
      cols.push({
        id: ACTIONS_COL,
        enableSorting: false,
        enableHiding: false,
        header: () => null,
        cell: ({ row }) => (
          <RowActionsMenu actions={rowActions(row.original)} label={labels.rowActions} />
        ),
      });
    }
    return cols;
  }, [columns, enableSelection, rowActions, labels]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting: presets.sorting,
      rowSelection,
      columnVisibility,
      columnOrder: presets.columnOrder,
    },
    getRowId,
    enableRowSelection: enableSelection,
    manualSorting,
    onSortingChange: handleSortingChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: presets.onColumnVisibilityChange,
    onColumnOrderChange: presets.onColumnOrderChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const selectedCount = selectedRows.length;
  const showPagination = totalLabel != null || onNextPage != null || onPrevPage != null;

  // Roving-tabindex keyboard navigation: arrows move the active row, space toggles its selection.
  const focusRow = React.useCallback((index: number) => {
    setActiveRow(index);
    bodyRef.current
      ?.querySelector<HTMLTableRowElement>(`[data-row-index="${index}"]`)
      ?.focus();
  }, []);

  const onBodyKeyDown = (event: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(Math.min(activeRow + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(Math.max(activeRow - 1, 0));
    } else if (event.key === " " && enableSelection) {
      event.preventDefault();
      rows[activeRow]?.toggleSelected();
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-bg-surface text-text-primary">
      <div
        className="flex items-center gap-2 border-b border-border"
        style={{ paddingInline: "var(--density-pad-x)", paddingBlock: "0.5rem" }}
      >
        <div className="flex-1">{toolbar}</div>
        <ColumnsMenu table={table} presets={presets} labels={labels} />
      </div>

      {enableSelection && selectedCount > 0 && (
        <BulkBar
          count={selectedCount}
          labels={labels}
          onClear={() => table.resetRowSelection()}
        >
          {bulkActions?.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => action.onClick(selectedRows)}
              className="rounded-sm underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-inverse"
            >
              {action.label}
            </button>
          ))}
        </BulkBar>
      )}

      <div
        className="overflow-auto"
        style={maxBodyHeight != null ? { maxHeight: maxBodyHeight } : undefined}
      >
        <table
          role="grid"
          className="w-full border-collapse text-left"
          style={{ fontSize: "var(--density-font)" }}
        >
          <thead
            className="sticky top-0 bg-bg-surface"
            style={{ zIndex: "var(--z-sticky)" }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const align = header.column.columnDef.meta?.align;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        canSort
                          ? sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                      className={cn(
                        "whitespace-nowrap py-2 text-caption font-semibold uppercase tracking-wide text-text-muted",
                        align === "right" ? "text-right" : "text-left",
                      )}
                      style={{ paddingInline: "var(--density-pad-x)" }}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase hover:text-text-primary",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                            align === "right" && "flex-row-reverse",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortGlyph state={sorted} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody ref={bodyRef} onKeyDown={onBodyKeyDown}>
            {error ? (
              <StateRow colSpan={visibleColumnCount}>
                <ErrorState error={error} labels={labels} onRetry={onRetry} />
              </StateRow>
            ) : isLoading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={visibleColumnCount} style={{ paddingInline: "var(--density-pad-x)" }}>
                    <Skeleton variant="table-row" columns={visibleColumnCount} />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <StateRow colSpan={visibleColumnCount}>
                <EmptyState state={emptyState} />
              </StateRow>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  data-row-index={i}
                  data-active={activeRow === i || undefined}
                  aria-selected={row.getIsSelected() || undefined}
                  tabIndex={activeRow === i ? 0 : -1}
                  onFocus={() => setActiveRow(i)}
                  className={cn(
                    "border-b border-border outline-none",
                    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus",
                    row.getIsSelected() && "bg-accent-subtle",
                    !isTouch && !row.getIsSelected() && "hover:bg-bg-sunken",
                  )}
                  style={{ height: "var(--density-row-h)" }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = cell.column.columnDef.meta?.align;
                    return (
                      <td
                        key={cell.id}
                        className={cn("align-middle", align === "right" && "text-right")}
                        style={{ paddingInline: "var(--density-pad-x)" }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div
          className="flex items-center justify-between gap-2 border-t border-border text-caption text-text-muted"
          style={{ paddingInline: "var(--density-pad-x)", paddingBlock: "0.5rem" }}
        >
          <span>{totalLabel}</span>
          <div className="flex items-center gap-2">
            {nextCursor === null && <span>{labels.endOfList}</span>}
            <PagerButton
              direction="prev"
              label={labels.previousPage}
              disabled={!onPrevPage}
              onClick={onPrevPage}
            />
            <PagerButton
              direction="next"
              label={labels.nextPage}
              disabled={nextCursor == null || !onNextPage}
              onClick={onNextPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** The asc / desc / unsorted indicator on a sortable header. */
function SortGlyph({ state }: { state: false | "asc" | "desc" }) {
  const Glyph = state === "asc" ? ChevronUp : state === "desc" ? ChevronDown : ChevronsUpDown;
  return (
    <Glyph
      aria-hidden
      className={cn("size-3.5 shrink-0", state === false && "text-text-muted")}
    />
  );
}

/** The magenta selection bar — the one place the spot color appears: selection & attention only. */
function BulkBar({
  count,
  labels,
  onClear,
  children,
}: {
  count: number;
  labels: DataTableLabels;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={labels.selected(count)}
      className="flex items-center gap-4 bg-spot text-sm font-medium text-text-inverse"
      style={{ paddingInline: "var(--density-pad-x)", minHeight: "var(--density-control-h)" }}
    >
      <span>{labels.selected(count)}</span>
      {children}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto rounded-sm underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-inverse"
      >
        {labels.clearSelection}
      </button>
    </div>
  );
}

/** A full-width row hosting a table state (empty / error) spanning every visible column. */
function StateRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        {children}
      </td>
    </tr>
  );
}

function EmptyState({ state }: { state?: DataTableEmptyState }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-medium text-text-primary">{state?.title ?? "Nothing here yet"}</p>
      {state?.description && (
        <p className="max-w-sm text-sm text-text-muted">{state.description}</p>
      )}
      {state?.action && <div className="mt-2">{state.action}</div>}
    </div>
  );
}

function ErrorState({
  error,
  labels,
  onRetry,
}: {
  error: { message: string };
  labels: DataTableLabels;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center"
    >
      <TriangleAlert aria-hidden className="size-6 text-danger" />
      <p className="font-medium text-text-primary">{labels.errorTitle}</p>
      <p className="max-w-sm text-sm text-text-muted">{error.message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-2 gap-2">
          <RotateCw aria-hidden style={{ width: "var(--density-icon)", height: "var(--density-icon)" }} />
          {labels.retry}
        </Button>
      )}
    </div>
  );
}

/** The Prev/Next affordance. Next disables at the end of the cursor (`next_cursor === null`). */
function PagerButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const Glyph = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Button variant="secondary" disabled={disabled} onClick={onClick} className="gap-1">
      {direction === "prev" && <Glyph aria-hidden className="size-4" />}
      {label}
      {direction === "next" && <Glyph aria-hidden className="size-4" />}
    </Button>
  );
}

/** The overflow menu of per-row actions, in a Radix popover so it's tap-accessible in Touch. */
function RowActionsMenu({ actions, label }: { actions: RowAction[]; label: string }) {
  if (actions.length === 0) return null;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="icon" aria-label={label} className="border-transparent bg-transparent">
          <MoreHorizontal
            aria-hidden
            style={{ width: "var(--density-icon)", height: "var(--density-icon)" }}
          />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="min-w-40 rounded-md border border-border bg-bg-surface-raised p-1 text-text-primary shadow-lg"
          style={{ zIndex: "var(--z-command)" }}
        >
          {actions.map((action) => (
            <Popover.Close asChild key={action.key}>
              <button
                type="button"
                onClick={action.onClick}
                className={cn(
                  "flex w-full items-center rounded-sm px-2 text-left text-sm hover:bg-bg-sunken",
                  "focus-visible:outline-none focus-visible:bg-bg-sunken",
                  action.destructive && "text-danger",
                )}
                style={{ minHeight: "var(--density-tap-min)" }}
              >
                {action.label}
              </button>
            </Popover.Close>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The column-visibility popover with save/reset for the client-persisted preset. */
function ColumnsMenu<TData>({
  table,
  presets,
  labels,
}: {
  table: Table<TData>;
  presets: ReturnType<typeof useColumnPresets>;
  labels: DataTableLabels;
}) {
  const hideable = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && c.id !== SELECT_COL && c.id !== ACTIONS_COL);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="secondary" className="gap-2">
          <SlidersHorizontal
            aria-hidden
            style={{ width: "var(--density-icon)", height: "var(--density-icon)" }}
          />
          {labels.columns}
          <ChevronDown aria-hidden className="size-4 text-text-muted" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="min-w-56 rounded-md border border-border bg-bg-surface-raised p-2 text-text-primary shadow-lg"
          style={{ zIndex: "var(--z-command)" }}
        >
          <div className="flex flex-col">
            {hideable.map((column) => {
              const header = column.columnDef.header;
              const columnLabel = typeof header === "string" ? header : column.id;
              return (
                <label
                  key={column.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bg-sunken"
                >
                  <Checkbox
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(value === true)}
                    aria-label={columnLabel}
                  />
                  {columnLabel}
                </label>
              );
            })}
          </div>
          {presets.canPersist && (
            <>
              <div className="my-2 border-t border-border" />
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={presets.savePreset}>
                  {labels.savePreset}
                </Button>
                <Button variant="ghost" className="flex-1" onClick={presets.resetPreset}>
                  {labels.resetPreset}
                </Button>
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
