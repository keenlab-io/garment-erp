import { Processor } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { BaseWorker } from "../queue/base.worker.js";
import { DEFAULT_JOB_OPTIONS, QUEUES } from "../queue/queue.constants.js";
import { StorageService } from "../storage/storage.service.js";
import { MailService } from "./mail.service.js";
import { REPORTING_EVENTS, type ReportDigestFailedPayload } from "./reporting.events.js";
import { isFinalAttempt } from "./reporting.util.js";

/** `email`-queue job name (design D9) — the queue's first consumer. */
export const REPORT_EMAIL_JOB = "reporting.email";

/**
 * An email job. Attachments reference stored objects by key (fetched at send time, so large
 * artifacts never travel through Redis). `alert` carries the context to raise as an in-app
 * alert if the send exhausts its retries — set for scheduled digests (spec report-schedules).
 */
export interface ReportEmailJob {
  to: string[];
  subject: string;
  text?: string;
  attachments?: { filename: string; storage_key: string; content_type?: string }[];
  alert?: ReportDigestFailedPayload;
}

/**
 * The `email` queue worker (task 3.3, design D9). Fetches each attachment from storage and sends
 * via `MailService`. A send failure retries under `DEFAULT_JOB_OPTIONS` (5 attempts, exponential
 * backoff); on the **final** attempt it raises a `ReportDigestFailed` in-app alert before
 * rethrowing so the job dead-letters. Idempotent: re-sending an already-delivered digest is
 * acceptable (design D12).
 */
@Processor(QUEUES.email)
export class EmailWorker extends BaseWorker<ReportEmailJob, { sent: true }> {
  constructor(
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly events: EventBusService,
  ) {
    super();
  }

  async handle(job: Job<ReportEmailJob>): Promise<{ sent: true }> {
    if (job.name !== REPORT_EMAIL_JOB) return { sent: true };
    const data = job.data;
    try {
      const attachments = await Promise.all(
        (data.attachments ?? []).map(async (a) => ({
          filename: a.filename,
          content: await this.storage.get(a.storage_key),
          contentType: a.content_type,
        })),
      );
      await this.mail.send({
        to: data.to,
        subject: data.subject,
        text: data.text,
        attachments,
      });
      return { sent: true };
    } catch (err) {
      const maxAttempts = job.opts.attempts ?? DEFAULT_JOB_OPTIONS.attempts ?? 1;
      if (data.alert && isFinalAttempt(job.attemptsMade, maxAttempts)) {
        this.events.publishAfterCommit(
          makeEvent<ReportDigestFailedPayload>({
            event: REPORTING_EVENTS.reportDigestFailed,
            payload: { ...data.alert, reason: String(err) },
          }),
        );
      }
      throw err;
    }
  }
}
