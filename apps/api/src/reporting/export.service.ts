import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import ExcelJS from "exceljs";
import {
  ReportExportFormat,
  type ExportStatusResult,
  type ReportExportFormat as ReportExportFormatT,
  type ReportResult,
} from "@erp/contracts";
import { NotFoundError } from "../common/errors/app-exception.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { PdfService } from "../pdf/pdf.service.js";
import { QUEUES } from "../queue/queue.constants.js";
import { StorageService } from "../storage/storage.service.js";
import { REPORTING_EVENTS, type ReportGeneratedPayload } from "./reporting.events.js";
import { ReportService } from "./report.service.js";
import { mapJobState, toCsv, toHtml, toReportQuery } from "./reporting.util.js";

/** `report`-queue job names (design D7). */
export const REPORT_EXPORT_JOB = "reporting.export";

/** Payload of an export job — a report key, output format, and its query params. */
export interface ReportExportJob {
  report_key: string;
  format: ReportExportFormatT;
  params: Record<string, unknown>;
}

const EXT: Record<ReportExportFormatT, string> = {
  PDF: "pdf",
  EXCEL: "xlsx",
  CSV: "csv",
};
const CONTENT_TYPE: Record<ReportExportFormatT, string> = {
  PDF: "application/pdf",
  EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv",
};

/** A rendered export artifact ready to store or attach to an email. */
export interface RenderedArtifact {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Async report export (task 4.3, design D7). `POST /reports/{key}/export` enqueues a job on the
 * `report` queue → 202 `{ job_id }`; the `ReportJobsWorker` calls `runExport`, which renders the
 * report (Excel via `exceljs`, CSV native, PDF via the shared Chromium), stores it via
 * `StorageService`, and emits `ReportGenerated`. `GET /exports/{job_id}` maps the job's state to
 * `{ status, file_url? }`, returning a signed URL only once the job has completed.
 */
@Injectable()
export class ExportService {
  constructor(
    @InjectQueue(QUEUES.report) private readonly queue: Queue,
    private readonly reports: ReportService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly events: EventBusService,
  ) {}

  /** Enqueue an export job; returns the job id for the 202 poll. */
  async enqueueExport(
    reportKey: string,
    format: ReportExportFormatT,
    params: Record<string, unknown>,
  ): Promise<{ job_id: string }> {
    const job = await this.queue.add(REPORT_EXPORT_JOB, {
      report_key: reportKey,
      format,
      params,
    } satisfies ReportExportJob);
    return { job_id: String(job.id ?? "") };
  }

  /** Render the report artifact for `(key, format, params)` — shared by exports and digests. */
  async renderArtifact(
    reportKey: string,
    format: ReportExportFormatT,
    params: Record<string, unknown>,
  ): Promise<RenderedArtifact> {
    const result = await this.reports.run(reportKey, toReportQuery(params));
    const filename = `${reportKey}.${EXT[format]}`;
    const buffer = await this.toBuffer(reportKey, format, result);
    return { buffer, contentType: CONTENT_TYPE[format], filename };
  }

  /** Render + store the export; returns the object key (the worker's return value). */
  async runExport(job: ReportExportJob): Promise<{ key: string }> {
    const artifact = await this.renderArtifact(job.report_key, job.format, job.params);
    const key = `exports/reports/${job.report_key}/${Date.now()}.${EXT[job.format]}`;
    await this.storage.put(key, artifact.buffer, artifact.contentType);
    this.events.publishAfterCommit(
      makeEvent<ReportGeneratedPayload>({
        event: REPORTING_EVENTS.reportGenerated,
        payload: { report_key: job.report_key, format: job.format, storage_key: key },
      }),
    );
    return { key };
  }

  /** Map a job's state to `{ status, file_url? }`; a signed URL only once DONE. */
  async getStatus(jobId: string): Promise<ExportStatusResult> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new NotFoundError(`Export job not found: ${jobId}`);
    const status = mapJobState(await job.getState());
    const key = (job.returnvalue as { key?: string } | undefined)?.key;
    if (status === "DONE" && key) {
      return { status, file_url: await this.storage.getSignedUrl(key) };
    }
    return { status };
  }

  private async toBuffer(
    reportKey: string,
    format: ReportExportFormatT,
    result: ReportResult,
  ): Promise<Buffer> {
    if (format === ReportExportFormat.CSV) return toCsv(result);
    if (format === ReportExportFormat.PDF) {
      return this.pdf.renderHtml(toHtml(reportKey, result));
    }
    // EXCEL
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(reportKey.slice(0, 31));
    sheet.addRow(result.columns.map((c) => c.label));
    for (const row of result.rows) {
      sheet.addRow(result.columns.map((c) => row[c.key] ?? ""));
    }
    sheet.addRow(result.columns.map((c) => result.totals[c.key] ?? ""));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
