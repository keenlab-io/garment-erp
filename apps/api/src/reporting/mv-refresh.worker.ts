import { Inject, type OnModuleInit } from "@nestjs/common";
import { InjectQueue, Processor } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Queue, type Job } from "bullmq";
import { sql } from "drizzle-orm";
import type { Db } from "@erp/db";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { ALL_VIEWS, MV_REFRESH_JOB, type MvName } from "./mv-refresh.js";

const MV_REFRESH_FALLBACK_ID = "reporting-mv-refresh-fallback";

/**
 * Runs the targeted refresh a debounced job asks for (task 4.6, design D10). The runtime role
 * neither owns the MVs nor may read their sources across tenants, so the refresh goes through
 * `reporting.refresh_mv(view)` (M7 design D8) — a SECURITY DEFINER function owned by
 * `erp_owner` that runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` over **all** tenants' rows for
 * an allowlisted view. It executes on the pool (never `uow.withTransaction`) — each MV's unique
 * index makes the concurrent refresh possible. A targeted job is tenant-scoped (its debounce
 * key); the refresh itself is global either way.
 *
 * On init it also registers a repeatable fallback that refreshes every view once — a platform
 * job with no tenant, since one refresh covers every tenant's rows — bounding staleness when
 * event-driven refreshes are quiet. A refresh failure (e.g. a view absent before the M6
 * migration applies) is logged, not thrown, so the queue never dead-letters on a dormant env.
 */
@Processor(QUEUES.mvRefresh)
export class MvRefreshWorker
  extends BaseWorker<{ view?: string; all?: boolean }, { ok: true }>
  implements OnModuleInit
{
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.mvRefresh) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const every = this.config.get<number>("MV_REFRESH_FALLBACK_MS") ?? 3_600_000;
    try {
      await this.queue.add(
        MV_REFRESH_JOB,
        { all: true },
        { repeat: { every }, jobId: MV_REFRESH_FALLBACK_ID },
      );
    } catch (err) {
      this.logger.warn(`Could not register the MV refresh fallback: ${String(err)}`);
    }
  }

  async handle(job: Job<{ view?: string; all?: boolean }>): Promise<{ ok: true }> {
    if (job.name !== MV_REFRESH_JOB) return { ok: true };
    const views: string[] = job.data.all
      ? [...ALL_VIEWS]
      : job.data.view
        ? [job.data.view]
        : [];
    for (const view of views) await this.refresh(view);
    return { ok: true };
  }

  /** Refresh one allowlisted view concurrently; log and swallow a failure. */
  private async refresh(view: string): Promise<void> {
    if (!ALL_VIEWS.includes(view as MvName)) {
      this.logger.warn(`Ignoring refresh for unknown view: ${view}`);
      return;
    }
    const ex = currentExecutor(this.db);
    try {
      await ex.execute(sql`SELECT reporting.refresh_mv(${view})`);
    } catch (err) {
      this.logger.warn(`REFRESH ${view} failed: ${String(err)}`);
    }
  }
}
