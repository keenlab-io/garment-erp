import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { and, eq } from "drizzle-orm";
import { reportSchedule, type Db } from "@erp/db";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { QUEUES } from "../queue/queue.constants.js";
import { StorageService } from "../storage/storage.service.js";
import { ExportService } from "./export.service.js";
import { REPORT_EMAIL_JOB, type ReportEmailJob } from "./mail.worker.js";
import {
  REPORTING_EVENTS,
  type ReportDigestFailedPayload,
  type ScheduledReportSentPayload,
} from "./reporting.events.js";

/**
 * Scheduled digest rendering (task 4.5, design D8). Runs from the `ReportJobsWorker` for both
 * the repeatable cron job and a `run-now` one-off: it renders the schedule's report, stores it,
 * and enqueues an `email` job carrying the artifact and the failure-alert context, then emits
 * `ScheduledReportSent`. The actual send (with retry + exhaustion alert) is the `EmailWorker`'s
 * job, so a digest render and its delivery fail independently. Idempotent on the schedule id +
 * job id (design D12).
 */
@Injectable()
export class DigestService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.email) private readonly emailQueue: Queue,
    private readonly exports: ExportService,
    private readonly storage: StorageService,
    private readonly events: EventBusService,
  ) {}

  /** Render + store the schedule's report and enqueue its digest email. */
  async runDigest(scheduleId: string): Promise<{ storage_key: string }> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(reportSchedule)
      .where(and(eq(reportSchedule.id, scheduleId)))
      .limit(1);
    if (!row) throw new NotFoundError(`Report schedule not found: ${scheduleId}`);

    const params = (row.params ?? {}) as Record<string, unknown>;
    const artifact = await this.exports.renderArtifact(row.reportKey, row.format, params);
    const storageKey = `digests/${row.id}/${Date.now()}.${artifact.filename.split(".").pop()}`;
    await this.storage.put(storageKey, artifact.buffer, artifact.contentType);

    const alert: ReportDigestFailedPayload = {
      schedule_id: row.id,
      report_key: row.reportKey,
      recipients: row.recipients,
      reason: "",
    };
    await this.emailQueue.add(REPORT_EMAIL_JOB, {
      to: row.recipients,
      subject: `Report digest: ${row.name}`,
      text: `Scheduled report "${row.reportKey}" is attached.`,
      attachments: [
        {
          filename: artifact.filename,
          storage_key: storageKey,
          content_type: artifact.contentType,
        },
      ],
      alert,
    } satisfies ReportEmailJob);

    this.events.publishAfterCommit(
      makeEvent<ScheduledReportSentPayload>({
        event: REPORTING_EVENTS.scheduledReportSent,
        payload: {
          schedule_id: row.id,
          report_key: row.reportKey,
          recipients: row.recipients,
          storage_key: storageKey,
        },
      }),
    );
    return { storage_key: storageKey };
  }
}
