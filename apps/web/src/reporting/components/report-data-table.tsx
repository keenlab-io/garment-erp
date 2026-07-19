import * as React from "react";
import { Download } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReportColumn, ReportRow, ReportTotals } from "@erp/contracts";
import { ExportStatus, ReportExportFormat, type ReportExportFormat as ReportExportFormatT } from "@erp/contracts";
import { Button, DataTable, cn, useToast } from "@erp/ui";
import { groupDigits } from "@erp/utils";
import { useExportReportMutation, useExportStatusQuery } from "../queries.js";

export interface ReportDataTableLabels {
  exportAction: string;
  exportPending: (format: ReportExportFormatT) => string;
  exportDone: string;
  exportFailed: string;
  download: string;
  totalsLabel: string;
  drillDown: string;
  emptyTitle: string;
}

const defaultLabels: ReportDataTableLabels = {
  exportAction: "Export",
  exportPending: (format) => `Generating ${format} export…`,
  exportDone: "Export ready",
  exportFailed: "Export failed",
  download: "Download",
  totalsLabel: "Total",
  drillDown: "View detail",
  emptyTitle: "No rows for this selection.",
};

function isNumericValue(value: string | number | null | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || value.trim() === "") return false;
  return Number.isFinite(Number(value));
}

/** Build TanStack column defs from a report's `{ key, label }` catalog (M6 §3.4) — a column reads
 * right-aligned tabular figures (grouped, no float) when its values are numeric, else plain text. */
export function buildReportColumns(columns: ReportColumn[], rows: ReportRow[]): ColumnDef<ReportRow>[] {
  return columns.map((column) => {
    const numeric = rows.some((row) => isNumericValue(row[column.key]));
    return {
      id: column.key,
      accessorKey: column.key,
      header: column.label,
      meta: { align: numeric ? "right" : "left" },
      cell: ({ getValue }) => {
        const value = getValue() as string | number | null | undefined;
        if (value === null || value === undefined || value === "") return "";
        return isNumericValue(value) ? (
          <span className="block text-right font-numeric tabular-nums">{groupDigits(String(value))}</span>
        ) : (
          String(value)
        );
      },
    };
  });
}

/** Render `totals` against the report's column catalog, dropping any key the catalog doesn't name. */
export function reportTotalsEntries(columns: ReportColumn[], totals: ReportTotals): Array<{ key: string; label: string; value: string }> {
  return columns
    .filter((column) => totals[column.key] !== undefined && totals[column.key] !== null)
    .map((column) => ({ key: column.key, label: column.label, value: groupDigits(String(totals[column.key])) }));
}

export interface ReportDataTableProps {
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportTotals;
  /** The report_key exports run against. */
  reportKey: string;
  isLoading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** Drill-down from a row to its underlying record (design MD4) — adds a row action when set. */
  onDrillDown?: (row: ReportRow) => void;
  /** Hide the built-in PDF/Excel/CSV export menu (e.g. the screen wires its own). */
  hideExport?: boolean;
  labels?: Partial<ReportDataTableLabels>;
  tableId?: string;
  className?: string;
}

/**
 * The report viewer's table (M6 §3.4, design MD4): a report's `{ columns, rows, totals }` on the
 * shared `DataTable` organism, a totals strip that reconciles visibly with the rows, an optional
 * drill-down row action, and an async PDF/Excel/CSV export menu — job-toast while pending,
 * resolving to a download notification (design FD7) once the job completes.
 */
export function ReportDataTable({
  columns,
  rows,
  totals,
  reportKey,
  isLoading = false,
  error = null,
  onRetry,
  onDrillDown,
  hideExport = false,
  labels: labelsProp,
  tableId,
  className,
}: ReportDataTableProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const tableColumns = React.useMemo(() => buildReportColumns(columns, rows), [columns, rows]);
  const totalsEntries = React.useMemo(
    () => (totals ? reportTotalsEntries(columns, totals) : []),
    [columns, totals],
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <DataTable
        data={rows}
        columns={tableColumns}
        tableId={tableId}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        emptyState={{ title: labels.emptyTitle }}
        rowActions={onDrillDown ? (row) => [{ key: "drillDown", label: labels.drillDown, onClick: () => onDrillDown(row) }] : undefined}
        toolbar={!hideExport ? <ExportMenu reportKey={reportKey} labels={labels} /> : undefined}
      />
      {totalsEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-border bg-bg-surface px-4 py-2">
          {totalsEntries.map((entry) => (
            <span key={entry.key} className="text-sm text-text-primary">
              <span className="text-text-secondary">
                {labels.totalsLabel} {entry.label}:{" "}
              </span>
              <span className="font-numeric tabular-nums">{entry.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ExportMenu({ reportKey, labels }: { reportKey: string; labels: ReportDataTableLabels }) {
  const { jobToast } = useToast();
  const exportMutation = useExportReportMutation();
  const [pollingJobId, setPollingJobId] = React.useState<string | null>(null);
  const statusQuery = useExportStatusQuery(pollingJobId ?? "", { enabled: Boolean(pollingJobId) });
  const handleRef = React.useRef<ReturnType<typeof jobToast> | null>(null);

  React.useEffect(() => {
    if (!pollingJobId || !handleRef.current) return;
    if (statusQuery.data?.status !== 200) return;
    const result = statusQuery.data.body;
    if (result.status === ExportStatus.DONE) {
      handleRef.current.resolve({
        tone: "success",
        title: labels.exportDone,
        action: result.file_url ? { label: labels.download, onClick: () => window.open(result.file_url, "_blank") } : undefined,
      });
      handleRef.current = null;
      setPollingJobId(null);
    } else if (result.status === ExportStatus.FAILED) {
      handleRef.current.resolve({ tone: "danger", title: labels.exportFailed });
      handleRef.current = null;
      setPollingJobId(null);
    }
  }, [statusQuery.data, pollingJobId, labels]);

  async function runExport(format: ReportExportFormatT) {
    const handle = jobToast({ title: labels.exportPending(format) });
    handleRef.current = handle;
    try {
      const result = await exportMutation.mutateAsync({
        params: { report_key: reportKey },
        body: { format, params: {} },
      });
      if (result.status === 202) {
        setPollingJobId(result.body.job_id);
      } else {
        handle.resolve({ tone: "danger", title: labels.exportFailed });
        handleRef.current = null;
      }
    } catch {
      handle.resolve({ tone: "danger", title: labels.exportFailed });
      handleRef.current = null;
    }
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label={labels.exportAction}>
      <Download aria-hidden className="size-4 text-text-secondary" />
      <span className="text-caption text-text-secondary">{labels.exportAction}</span>
      {Object.values(ReportExportFormat).map((format) => (
        <Button key={format} variant="secondary" onClick={() => void runExport(format)}>
          {format}
        </Button>
      ))}
    </div>
  );
}
