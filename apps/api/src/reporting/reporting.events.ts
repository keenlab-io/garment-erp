/**
 * M6 reporting domain-event names and payload shapes (design D7/D8). The module emits
 * `ReportGenerated` (an export job finished and stored its artifact) and `ScheduledReportSent`
 * (a digest was rendered and handed to the mail transport). `ReportDigestFailed` is the in-app
 * alert raised when a digest's email send exhausts its retries (spec report-schedules).
 */
export const REPORTING_EVENTS = {
  reportGenerated: "reporting.report.generated",
  scheduledReportSent: "reporting.schedule.sent",
  reportDigestFailed: "reporting.schedule.failed",
} as const;

/** Payload of `ReportGenerated` — an export artifact landed in object storage. */
export interface ReportGeneratedPayload {
  report_key: string;
  format: string;
  storage_key: string;
}

/** Payload of `ScheduledReportSent` — a digest was rendered + emailed. */
export interface ScheduledReportSentPayload {
  schedule_id: string;
  report_key: string;
  recipients: string[];
  storage_key: string;
}

/** Payload of `ReportDigestFailed` — the in-app alert for an exhausted digest send. */
export interface ReportDigestFailedPayload {
  schedule_id: string;
  report_key: string;
  recipients: string[];
  reason: string;
}
