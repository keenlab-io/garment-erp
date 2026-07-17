import { Inject, type OnModuleInit } from "@nestjs/common";
import { InjectQueue, Processor } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Queue, type Job } from "bullmq";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { subcontract, workOrderStep, type Db } from "@erp/db";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import {
  PRODUCTION_EVENTS,
  REALTIME_EVENTS,
  TIMELINE_ROOM,
  type StepEventPayload,
  type SubcontractOverduePayload,
  woRoom,
} from "./production.events.js";
import { isStepDelayed } from "./production.util.js";

/** The repeatable monitor job on the `default` queue. */
export const PRODUCTION_MONITOR_JOB = "production.monitor.sweep";
const PRODUCTION_MONITOR_SCHEDULER_ID = "production-monitor";

/**
 * The production monitor sweep (task 4.4, design D5) — the first repeatable BullMQ job. On
 * module init it upserts a repeatable job on the `default` queue (cadence configurable via
 * `PRODUCTION_MONITOR_INTERVAL_MS`, default ~60s); each tick, in one transaction, it:
 *
 * - flips `SENT` subcontracts past their `sla_due` to OVERDUE, emitting `SubcontractOverdue`;
 * - flags `IN_PROGRESS` steps whose elapsed time exceeds `standard_time_min` and have not yet
 *   been flagged, emitting `StepDelayed` **exactly once** (idempotent via `delay_notified`)
 *   and pushing to the `wo:{id}` / `timeline` realtime rooms.
 *
 * Idempotency (the persisted flag + upserted scheduler) means a redelivered job or a fast
 * cadence never double-alerts.
 */
@Processor(QUEUES.default)
export class ProductionMonitorWorker
  extends BaseWorker<unknown, { ok: true }>
  implements OnModuleInit
{
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.default) private readonly queue: Queue,
    private readonly uow: UnitOfWork,
    private readonly config: ConfigService,
    private readonly events: EventBusService,
    private readonly realtime: RealtimeGateway,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const every =
      this.config.get<number>("PRODUCTION_MONITOR_INTERVAL_MS") ?? 60_000;
    try {
      // Upserted (not re-added) so a restart never stacks duplicate schedulers.
      await this.queue.add(
        PRODUCTION_MONITOR_JOB,
        {},
        { repeat: { every }, jobId: PRODUCTION_MONITOR_SCHEDULER_ID },
      );
    } catch (err) {
      this.logger.warn(`Could not register the production monitor job: ${String(err)}`);
    }
  }

  async handle(job: Job): Promise<{ ok: true }> {
    if (job.name === PRODUCTION_MONITOR_JOB) {
      await this.uow.withTransaction(() => this.sweep(new Date()));
    }
    return { ok: true };
  }

  /**
   * One monitor pass at instant `now`. Runs inside the caller's transaction (via
   * `currentExecutor`). Returns the counts flagged, for logging/tests.
   */
  async sweep(now: Date): Promise<{ delayed: number; overdue: number }> {
    return { delayed: await this.sweepDelays(now), overdue: await this.sweepOverdue(now) };
  }

  /** IN_PROGRESS steps over standard time, not yet flagged → `StepDelayed` once. */
  private async sweepDelays(now: Date): Promise<number> {
    const ex = currentExecutor(this.db);
    const candidates = await ex
      .select()
      .from(workOrderStep)
      .where(
        and(
          eq(workOrderStep.status, "IN_PROGRESS"),
          eq(workOrderStep.delayNotified, false),
          isNotNull(workOrderStep.startedAt),
        ),
      );

    let flagged = 0;
    for (const step of candidates) {
      if (!isStepDelayed(step, now)) continue;
      await ex
        .update(workOrderStep)
        .set({ delayNotified: true })
        .where(eq(workOrderStep.id, step.id));

      const payload: StepEventPayload = {
        wo_id: step.woId,
        step_id: step.id,
        seq: step.seq,
        name: step.name,
        status: step.status,
      };
      this.realtime.emitToRoom(woRoom(step.woId), REALTIME_EVENTS.stepDelayed, payload);
      this.realtime.emitToRoom(TIMELINE_ROOM, REALTIME_EVENTS.stepDelayed, payload);
      this.events.publishAfterCommit(
        makeEvent({ event: PRODUCTION_EVENTS.stepDelayed, payload }),
      );
      flagged++;
    }
    return flagged;
  }

  /** SENT subcontracts past `sla_due` → OVERDUE, emitting `SubcontractOverdue`. */
  private async sweepOverdue(now: Date): Promise<number> {
    const ex = currentExecutor(this.db);
    const overdue = await ex
      .select()
      .from(subcontract)
      .where(and(eq(subcontract.status, "SENT"), lt(subcontract.slaDue, now)));

    for (const sc of overdue) {
      await ex
        .update(subcontract)
        .set({ status: "OVERDUE" })
        .where(eq(subcontract.id, sc.id));
      this.events.publishAfterCommit(
        makeEvent<SubcontractOverduePayload>({
          event: PRODUCTION_EVENTS.subcontractOverdue,
          payload: {
            subcontract_id: sc.id,
            wo_step_id: sc.woStepId,
            vendor: sc.vendor,
          },
        }),
      );
    }
    return overdue.length;
  }
}
