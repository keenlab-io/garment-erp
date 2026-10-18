import type { OnModuleInit } from "@nestjs/common";
import { InjectQueue, Processor } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Queue, type Job } from "bullmq";
import { BaseWorker } from "../../queue/base.worker.js";
import { QUEUES } from "../../queue/queue.constants.js";
import { DunningService, type DunningSweepResult } from "./dunning.service.js";

/** The repeatable dunning-sweep job on the `billing` queue. */
export const BILLING_DUNNING_JOB = "billing.dunning";
const BILLING_DUNNING_SCHEDULER_ID = "billing-dunning";

/**
 * The `billing`-queue worker (M9 §4.1, design D5). On module init it registers ONE repeatable
 * `billing.dunning` job (cadence `BILLING_SWEEP_MS`; the fixed job key means replicas don't stack
 * schedulers). The tick is a control-plane job (`PLATFORM_JOBS`): it runs unscoped over the exempt
 * subscription rows — no per-tenant fan-out — and is idempotent, so a redelivered or overlapping
 * tick changes nothing already recorded. Foreign job names are ignored.
 */
@Processor(QUEUES.billing)
export class DunningWorker
  extends BaseWorker<unknown, DunningSweepResult | null>
  implements OnModuleInit
{
  constructor(
    @InjectQueue(QUEUES.billing) private readonly queue: Queue,
    private readonly dunning: DunningService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const every = this.config.get<number>("BILLING_SWEEP_MS") ?? 3_600_000;
    try {
      await this.queue.add(
        BILLING_DUNNING_JOB,
        {},
        { repeat: { every }, jobId: BILLING_DUNNING_SCHEDULER_ID },
      );
    } catch (err) {
      this.logger.warn(`Could not register the billing dunning sweep: ${String(err)}`);
    }
  }

  async handle(job: Job): Promise<DunningSweepResult | null> {
    if (job.name !== BILLING_DUNNING_JOB) return null;
    const result = await this.dunning.sweep(new Date());
    this.logger.log(
      `dunning sweep: ${result.processed} processed, ${result.transitions} transitions, ` +
        `${result.renewalsIssued} renewals, ${result.reminders} reminders, ${result.failed} failed`,
    );
    return result;
  }
}
