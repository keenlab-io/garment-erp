import type { OnModuleInit } from "@nestjs/common";
import { InjectQueue, Processor } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Queue, type Job } from "bullmq";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import {
  DEMO_IDLE_SWEEP_JOB,
  DEMO_IDLE_SWEEP_SCHEDULER_ID,
  DEMO_PURGE_JOB,
  type DemoPurgeJobData,
} from "./demo.constants.js";
import { DemoPurgeService } from "./demo-purge.service.js";
import { DemoSweepService } from "./demo-sweep.service.js";

/**
 * The `demo`-queue worker (M10 tasks 4.3/4.5) — the one dispatcher for `demo.purge` and the
 * repeatable `demo.idle-sweep`, so no two workers compete for the queue. Mounted only in cloud
 * worker processes. On init it registers ONE repeatable sweep (cadence `DEMO_SWEEP_INTERVAL_MS`,
 * fixed scheduler key so replicas don't stack). `BaseWorker` runs each body inside
 * `withTenantJob`: a purge as its payload's tenant, the sweep unscoped (`PLATFORM_JOBS`). Both are
 * idempotent under redelivery. Foreign job names are ignored.
 */
@Processor(QUEUES.demo)
export class DemoJobsWorker extends BaseWorker<unknown, unknown> implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUES.demo) private readonly queue: Queue,
    private readonly purge: DemoPurgeService,
    private readonly sweep: DemoSweepService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const every = this.config.get<number>("DEMO_SWEEP_INTERVAL_MS") ?? 300_000;
    try {
      await this.queue.add(
        DEMO_IDLE_SWEEP_JOB,
        {},
        { repeat: { every }, jobId: DEMO_IDLE_SWEEP_SCHEDULER_ID },
      );
    } catch (err) {
      this.logger.warn(`Could not register the demo idle sweep: ${String(err)}`);
    }
  }

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case DEMO_PURGE_JOB:
        return this.purge.runPurge((job.data as Partial<DemoPurgeJobData>).trigger ?? "RETRY");
      case DEMO_IDLE_SWEEP_JOB: {
        const result = await this.sweep.sweep(new Date());
        this.logger.log(
          `demo sweep: ${result.checked} checked, ${result.purging} to purge, ` +
            `${result.requeued} re-queued, ${result.failed} failed`,
        );
        return result;
      }
      default:
        return null;
    }
  }
}
