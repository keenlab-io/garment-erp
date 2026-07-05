import { Logger } from "@nestjs/common";
import { WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

/**
 * Base for BullMQ workers. Wraps the concrete `handle()` with structured logging.
 * Subclasses MUST be idempotent on `(event, correlation_id)`: M0's after-commit
 * dispatch is not crash-safe (design D3 / Risks), so a job may be delivered more
 * than once.
 */
export abstract class BaseWorker<T = unknown, R = unknown> extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  async process(job: Job<T, R>): Promise<R> {
    this.logger.log(`processing job ${job.id ?? "?"} (${job.name})`);
    try {
      const result = await this.handle(job);
      this.logger.log(`completed job ${job.id ?? "?"}`);
      return result;
    } catch (err) {
      this.logger.error(`failed job ${job.id ?? "?"}: ${String(err)}`);
      throw err;
    }
  }

  abstract handle(job: Job<T, R>): Promise<R>;
}
