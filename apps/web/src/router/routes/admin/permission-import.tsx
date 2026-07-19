import * as React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@erp/ui";
import { useImportMutation } from "../../../iam/queries.js";
import { ImportValidationTable, type ImportRowResult } from "../../../iam/components/import-validation-table.js";

/** The uniform error envelope (`{ code, message, details }`) a non-200 import response throws. */
interface ImportOutcome {
  status: number;
  body: { details: { field?: string; issue: string }[] };
}

function isImportOutcome(error: unknown): error is ImportOutcome {
  return typeof error === "object" && error !== null && "status" in error && "body" in error;
}

/**
 * Reconstructs a per-row review from `ImportResult` (skipped rows carry real row numbers/reasons;
 * successful rows don't — the contract only returns a count). Row numbers for the successful rows
 * are inferred by assuming a contiguous sheet starting after the header (row 1) with no blank rows
 * in between; a sheet with blank rows will show slightly-off row numbers for its "OK" rows, but the
 * OK/error split and every skip reason stay accurate either way.
 */
function rowsFromResult(imported: number, skipped: { row: number; reason: string }[]): ImportRowResult[] {
  const skippedByRow = new Map(skipped.map((s) => [s.row, s.reason]));
  const total = imported + skipped.length;
  return Array.from({ length: total }, (_, i) => {
    const row = i + 2;
    const reason = skippedByRow.get(row);
    return reason !== undefined ? { row, status: "error" as const, reason } : { row, status: "ok" as const };
  });
}

/** All-or-nothing failures (an unknown permission code) report per-row `details` instead. */
function rowsFromError(details: { field?: string; issue: string }[]): ImportRowResult[] {
  return details.map((detail, index) => {
    const match = detail.field?.match(/row (\d+)/);
    return { row: match ? Number(match[1]) : index + 1, status: "error", reason: detail.issue };
  });
}

/**
 * The permission-import screen (M1 §4.5, MD5). The contract's `POST /iam/import` validates and
 * applies the whole file in one atomic call — there is no separate dry-run — so selecting a file
 * both reviews and imports it; the resulting table is the validation review. A second click of
 * "Import N valid rows" re-submits the same file: safe, because role/permission import upserts by
 * role name rather than failing on a re-run.
 */
export function PermissionImportPage() {
  const { t } = useTranslation("iam");
  const importMutation = useImportMutation();
  const [rows, setRows] = React.useState<ImportRowResult[]>([]);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [importedCount, setImportedCount] = React.useState<number | null>(null);

  function runImport(file: File) {
    setSelectedFile(file);
    importMutation.mutate(file, {
      onSuccess: (result) => {
        setImportedCount(result.imported);
        setRows(rowsFromResult(result.imported, result.skipped));
      },
      onError: (error) => {
        setImportedCount(null);
        setRows(isImportOutcome(error) ? rowsFromError(error.body.details) : []);
      },
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("import.title")}</h1>
        <p className="text-sm text-text-secondary">{t("import.description")}</p>
      </div>

      {importedCount !== null && (
        <Badge tone="success" className="w-fit">
          {t("import.importedSummary", { count: importedCount })}
        </Badge>
      )}

      <ImportValidationTable
        rows={rows}
        isImporting={importMutation.isPending}
        onFilesSelected={(files) => {
          const file = files[0];
          if (file) runImport(file);
        }}
        onImport={() => {
          if (selectedFile) runImport(selectedFile);
        }}
      />
    </div>
  );
}
