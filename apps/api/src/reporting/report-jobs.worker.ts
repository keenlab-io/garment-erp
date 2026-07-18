import { Processor } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { DigestService } from "./digest.service.js";
import { ExportService, REPORT_EXPORT_JOB, type ReportExportJob } from "./export.service.js";
import { REPORT_DIGEST_JOB } from "./report-schedule.service.js";

/**
 * The `report`-queue worker (tasks 4.3/4.5, design D7/D8/D12). One worker for the queue — it
 * dispatches both async report exports and scheduled/one-off digest renders, so no two workers
 * ever compete for the same queue's jobs. Each branch runs in its own transaction; both are
 * idempotent under redelivery (an export re-renders to a new key; a digest re-enqueues its
 * email). Foreign job names are ignored.
 */
@Processor(QUEUES.report)
export class ReportJobsWorker extends BaseWorker<unknown, { key?: string } | null> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly exports: ExportService,
    private readonly digests: DigestService,
  ) {
    super();
  }

  async handle(job: Job): Promise<{ key?: string } | null> {
    switch (job.name) {
      case REPORT_EXPORT_JOB: {
        const data = job.data as ReportExportJob;
        return this.uow.withTransaction(() => this.exports.runExport(data));
      }
      case REPORT_DIGEST_JOB: {
        const { schedule_id } = job.data as { schedule_id: string };
        const { storage_key } = await this.uow.withTransaction(() =>
          this.digests.runDigest(schedule_id),
        );
        return { key: storage_key };
      }
      default:
        return null;
    }
  }
}
