import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { WorkerHost } from "@nestjs/bullmq";

/**
 * Drains every BullMQ worker during the *first* phase of Nest's shutdown.
 *
 * Why this exists: `@nestjs/bullmq`'s explorer closes its workers in `onApplicationShutdown`,
 * which is Nest's **last** shutdown phase — but `DbModule` used to end the postgres pool and
 * `PdfService` used to close Chromium in `onModuleDestroy`, the **first**. A worker still
 * processing a payroll run or a PDF render therefore lost its database connection and its
 * browser mid-job on every SIGTERM. Hooks within a phase also run concurrently
 * (`Promise.all` in Nest's `callModuleDestroyHook`), so simply moving teardown between
 * providers cannot fix the race.
 *
 * The fix is to make the order explicit rather than incidental:
 *
 *   1. `onModuleDestroy`      — this service closes the workers and waits for the active job.
 *   2. `onApplicationShutdown` — DB pool, Chromium and the socket.io redis clients close.
 *
 * By the time the explorer's own `onApplicationShutdown` runs, every worker is already closed
 * and `worker.close()` is idempotent, so it is a no-op.
 *
 * `terminationGracePeriodSeconds` on the `erp-worker` Deployment (120s) must stay comfortably
 * above the longest job — otherwise the kubelet SIGKILLs mid-drain and the job is retried.
 */
@Injectable()
export class WorkerDrainService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerDrainService.name);

  constructor(private readonly discovery: DiscoveryService) {}

  async onModuleDestroy(): Promise<void> {
    const hosts = this.discovery
      .getProviders()
      .map((wrapper) => wrapper.instance)
      .filter((instance): instance is WorkerHost => instance instanceof WorkerHost);

    if (hosts.length === 0) return;

    this.logger.log(`draining ${hosts.length} worker(s) before teardown`);
    await Promise.all(
      hosts.map(async (host) => {
        try {
          // `.worker` throws if the explorer never registered this host (manual registration
          // disabled, or the process was killed during bootstrap) — nothing to drain then.
          await host.worker.close();
        } catch (err) {
          this.logger.warn(`worker drain skipped: ${String(err)}`);
        }
      }),
    );
    this.logger.log("workers drained");
  }
}
