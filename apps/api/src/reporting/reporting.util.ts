import { ExportStatus, type ReportQuery, type ReportResult } from "@erp/contracts";

/** Coerce loose export `params` (JSON) into the string-valued `ReportQuery` a builder expects. */
export function toReportQuery(params: Record<string, unknown> | undefined): ReportQuery {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (typeof v === "string") query[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") query[k] = String(v);
  }
  return query as ReportQuery;
}

/** Map a BullMQ job state to the export lifecycle status (spec report-export). */
export function mapJobState(state: string): ExportStatus {
  switch (state) {
    case "completed":
      return ExportStatus.DONE;
    case "failed":
      return ExportStatus.FAILED;
    case "active":
      return ExportStatus.RUNNING;
    default:
      // waiting | delayed | prioritized | waiting-children | unknown
      return ExportStatus.PENDING;
  }
}

/**
 * Whether the attempt now failing is the job's last (design D8 / spec report-schedules): a
 * digest whose email send exhausts its retries raises an in-app alert on this boundary.
 * `attemptsMade` is the count of attempts already completed before the current one.
 */
export function isFinalAttempt(attemptsMade: number, maxAttempts: number): boolean {
  return attemptsMade + 1 >= Math.max(1, maxAttempts);
}

/** One CSV field, quoted + escaped when it contains a comma, quote, or newline (RFC 4180). */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Render a report result as a CSV buffer (native streaming-friendly — header + one row/line). */
export function toCsv(result: ReportResult): Buffer {
  const header = result.columns.map((c) => csvCell(c.label)).join(",");
  const lines = result.rows.map((row) =>
    result.columns.map((c) => csvCell(row[c.key])).join(","),
  );
  return Buffer.from([header, ...lines].join("\n"), "utf8");
}

/** Render a report result as a minimal HTML table — fed to `PdfService.renderHtml`. */
export function toHtml(reportKey: string, result: ReportResult): string {
  const head = result.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = result.rows
    .map(
      (row) =>
        `<tr>${result.columns
          .map((c) => `<td>${escapeHtml(row[c.key])}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const totals = result.columns
    .map((c) => `<td>${escapeHtml(result.totals[c.key] ?? "")}</td>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    table{border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px}
    th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
    tfoot td{font-weight:bold}
  </style></head><body>
    <h1>${escapeHtml(reportKey)}</h1>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>
    <tfoot><tr>${totals}</tr></tfoot></table>
  </body></html>`;
}

function escapeHtml(value: unknown): string {
  return value == null
    ? ""
    : String(value).replace(
        /[&<>"']/g,
        (ch) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
      );
}
