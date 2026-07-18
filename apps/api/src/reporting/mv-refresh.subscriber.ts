import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { OnEvent } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { QUEUES } from "../queue/queue.constants.js";
import type { DomainEvent } from "../events/domain-event.js";
import { MV_REFRESH_JOB, MV_REFRESH_TRIGGERS, viewsForEvent } from "./mv-refresh.js";

/**
 * Event-driven MV refresh (task 4.6, design D10). Listens for the M3 stock and M5 sales domain
 * events — dormant until those modules emit — and, on the after-commit path they publish on,
 * enqueues a **debounced** targeted refresh for only the affected view(s). Debounce is a delayed
 * job keyed by view name: while one is pending, further events for that view coalesce onto it
 * (BullMQ dedups by `jobId`), so an event burst collapses into a single `REFRESH`.
 */
@Injectable()
export class MvRefreshSubscriber {
  private readonly logger = new Logger(MvRefreshSubscriber.name);
  private readonly debounceMs: number;

  constructor(
    @InjectQueue(QUEUES.mvRefresh) private readonly queue: Queue,
    config: ConfigService,
  ) {
    this.debounceMs = config.get<number>("MV_REFRESH_DEBOUNCE_MS") ?? 5_000;
  }

  @OnEvent(MV_REFRESH_TRIGGERS)
  async onDomainEvent(event: DomainEvent): Promise<void> {
    for (const view of viewsForEvent(event.event)) {
      try {
        await this.queue.add(
          MV_REFRESH_JOB,
          { view },
          {
            // One pending job per view — the debounce window coalesces bursts.
            jobId: `${MV_REFRESH_JOB}:${view}`,
            delay: this.debounceMs,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      } catch (err) {
        this.logger.warn(`Could not enqueue refresh for ${view}: ${String(err)}`);
      }
    }
  }
}
