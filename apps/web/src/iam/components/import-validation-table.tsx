import * as React from "react";
import { UploadCloud } from "lucide-react";
import { Badge, Button, cn } from "@erp/ui";

export interface ImportRowResult {
  row: number;
  status: "ok" | "error";
  reason?: string;
}

export interface ImportValidationTableLabels {
  dropzoneLabel: string;
  dropzoneHint: string;
  browseButton: string;
  rowColumn: string;
  statusColumn: string;
  reasonColumn: string;
  okStatus: string;
  errorStatus: string;
  importValid: (n: number) => string;
  reupload: string;
  noRows: string;
}

const defaultLabels: ImportValidationTableLabels = {
  dropzoneLabel: "Drop an Excel file here",
  dropzoneHint: "or click to browse — .xlsx files only",
  browseButton: "Browse files",
  rowColumn: "Row",
  statusColumn: "Status",
  reasonColumn: "Reason",
  okStatus: "OK",
  errorStatus: "Error",
  importValid: (n) => `Import ${n} valid row${n === 1 ? "" : "s"}`,
  reupload: "Fix & re-upload",
  noRows: "Upload a file to see the validation review.",
};

export interface ImportValidationTableProps {
  /** The per-row validation result of the last uploaded file (empty before any upload). */
  rows: ImportRowResult[];
  onFilesSelected: (files: File[]) => void;
  /** Imports only the valid rows — never a silent all-or-nothing failure (MD5). */
  onImport: () => void;
  /** Re-opens the file picker so the user can fix and re-upload. Defaults to `onFilesSelected`'s picker. */
  onReupload?: () => void;
  isImporting?: boolean;
  labels?: Partial<ImportValidationTableLabels>;
  className?: string;
}

/**
 * The permission-import validation review (MD5): an upload dropzone plus a per-row OK/error table.
 * The primary action imports only the valid rows; "fix & re-upload" is always the alternative to a
 * dead-end. Presentational — the permission-import screen (M1 §4.5) owns the actual upload/import
 * requests and supplies `rows` from the validation response.
 */
export function ImportValidationTable({
  rows,
  onFilesSelected,
  onImport,
  onReupload,
  isImporting = false,
  labels: labelsProp,
  className,
}: ImportValidationTableProps) {
  const labels = React.useMemo(() => ({ ...defaultLabels, ...labelsProp }), [labelsProp]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const validCount = rows.filter((row) => row.status === "ok").length;

  function openPicker() {
    inputRef.current?.click();
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected([...fileList]);
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-bg-sunken px-6 py-8 text-center",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
          isDragOver && "border-accent bg-accent-subtle",
        )}
      >
        <UploadCloud aria-hidden className="size-8 text-text-muted" />
        <p className="text-body-strong text-text-primary">{labels.dropzoneLabel}</p>
        <p className="text-caption text-text-muted">{labels.dropzoneHint}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="sr-only"
          aria-label={labels.browseButton}
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{labels.noRows}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-bg-sunken">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {labels.rowColumn}
                  </th>
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {labels.statusColumn}
                  </th>
                  <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {labels.reasonColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.row} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-mono text-mono text-text-primary">{row.row}</td>
                    <td className="px-3 py-2">
                      {row.status === "ok" ? (
                        <Badge tone="success">{labels.okStatus}</Badge>
                      ) : (
                        <Badge tone="danger">{labels.errorStatus}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{row.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={onImport} disabled={validCount === 0} loading={isImporting}>
              {labels.importValid(validCount)}
            </Button>
            <Button variant="secondary" onClick={onReupload ?? openPicker}>
              {labels.reupload}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
