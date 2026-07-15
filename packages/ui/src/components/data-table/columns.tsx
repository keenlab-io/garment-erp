import type { ColumnDef, RowData } from "@tanstack/react-table";
import { MoneyCell, QtyCell } from "../numeric-cell/numeric-cell.js";
import { InkChip } from "../ink-chip/ink-chip.js";
import type { ChipStatus } from "../ink-chip/status.js";

/**
 * Extra column metadata the DataTable reads off each column definition. `secondary` columns are
 * dropped in Touch density (floor/tablet views show essentials only); `align` right-justifies the
 * header and cell so numeric columns line up under tabular figures.
 */
declare module "@tanstack/react-table" {
  // Type params must match the base declaration verbatim to merge; they are unused here by design.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Hidden in Touch density so shop-floor views keep only essential columns. */
    secondary?: boolean;
    /** Cell/header alignment; numeric columns set `right` for decimal-aligned figures. */
    align?: "left" | "right";
  }
}

/** A cell value that can be rendered as-is (string/number) after the column's accessor runs. */
type Accessor<TData> = Extract<keyof TData, string>;

interface BaseColumnOptions {
  /** Column id; defaults to the accessor key. Give one when two columns share an accessor. */
  id?: string;
  /** Header label (a plain string — pass a localized value from the app). */
  header: string;
  /** Show a sort control on the header and cycle asc → desc → none. */
  sortable?: boolean;
  /** Hidden in Touch density. */
  secondary?: boolean;
}

/** A plain text column. `mono` renders the value as a monospace document id in link ink. */
export function textColumn<TData extends RowData>(
  accessorKey: Accessor<TData>,
  options: BaseColumnOptions & { mono?: boolean },
): ColumnDef<TData> {
  return {
    id: options.id ?? accessorKey,
    accessorKey,
    header: options.header,
    enableSorting: options.sortable ?? false,
    meta: { secondary: options.secondary },
    cell: options.mono
      ? ({ getValue }) => (
          <span className="font-mono text-mono text-text-link">{String(getValue() ?? "")}</span>
        )
      : ({ getValue }) => String(getValue() ?? ""),
  };
}

/** A money column: right-aligned tabular figures via `MoneyCell` (string in, no float). */
export function moneyColumn<TData extends RowData>(
  accessorKey: Accessor<TData>,
  options: BaseColumnOptions & { currency?: string; scale?: number },
): ColumnDef<TData> {
  return {
    id: options.id ?? accessorKey,
    accessorKey,
    header: options.header,
    enableSorting: options.sortable ?? false,
    meta: { secondary: options.secondary, align: "right" },
    cell: ({ getValue }) => (
      <MoneyCell
        value={getValue() as string}
        currency={options.currency}
        scale={options.scale}
      />
    ),
  };
}

/** A quantity column: right-aligned tabular figures via `QtyCell` (string in, no float). */
export function qtyColumn<TData extends RowData>(
  accessorKey: Accessor<TData>,
  options: BaseColumnOptions & { unit?: string; scale?: number },
): ColumnDef<TData> {
  return {
    id: options.id ?? accessorKey,
    accessorKey,
    header: options.header,
    enableSorting: options.sortable ?? false,
    meta: { secondary: options.secondary, align: "right" },
    cell: ({ getValue }) => (
      <QtyCell value={getValue() as string} unit={options.unit} scale={options.scale} />
    ),
  };
}

/** A status column rendering the Ink-Chip signature. `resolve` maps a row value to a `ChipStatus`. */
export function statusColumn<TData extends RowData, TValue = ChipStatus>(
  accessorKey: Accessor<TData>,
  options: BaseColumnOptions & { resolve?: (value: TValue) => ChipStatus },
): ColumnDef<TData> {
  const resolve = options.resolve ?? ((value: TValue) => value as unknown as ChipStatus);
  return {
    id: options.id ?? accessorKey,
    accessorKey,
    header: options.header,
    enableSorting: options.sortable ?? false,
    meta: { secondary: options.secondary },
    cell: ({ getValue }) => <InkChip status={resolve(getValue() as TValue)} />,
  };
}
