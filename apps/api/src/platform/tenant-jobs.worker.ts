import { Processor } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { TENANT_EXPORT_JOB, TENANT_PURGE_JOB, TenantDataService } from "./tenant-data.service.js";

/**
 * The `tenant`-queue worker (M8 design D9): the one dispatcher for `tenant.export` and
 * `tenant.purge`, so no two workers compete for the queue. `BaseWorker` runs each body inside
 * `withTenantJob`, i.e. as the payload's tenant. Both bodies are idempotent under redelivery (an
 * export re-archives to a new key; a purge resumes from what is left). Foreign names are ignored.
 */
@Processor(QUEUES.tenant)
export class TenantJobsWorker extends BaseWorker<unknown, unknown> {
  constructor(private readonly data: TenantDataService) {
    super();
  }

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case TENANT_EXPORT_JOB:
        return this.data.runExport();
      case TENANT_PURGE_JOB:
        return this.data.runPurge();
      default:
        return null;
    }
  }
}
