import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { formatQty } from "@erp/utils";
import { workOrder, workOrderStep, type Db } from "@erp/db";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import {
  PRODUCTION_EVENTS,
  type WorkOrderCompletedPayload,
} from "./production.events.js";

/**
 * Completion → backflush (task 4.6, design D7). When the last materialized step of a work
 * order reaches COMPLETED, the WO transitions to COMPLETED and emits `WorkOrderCompleted`
 * via **`publishAfterCommit`** — so a downstream backflush failure never rolls back the
 * durable completion. `correlation_id` auto-propagates from the unit of work; M3's consumer
 * is idempotent on `wo_id`, so exactly one backflush results. The payload carries an `audit`
 * block for free audit logging.
 */
@Injectable()
export class CompletionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly events: EventBusService,
  ) {}

  /**
   * Called after a step FINISH. If every step of the work order is now COMPLETED and the WO
   * is not already COMPLETED, transition it and emit `WorkOrderCompleted` exactly once.
   */
  async maybeComplete(woId: string, actorUserId: string | null): Promise<boolean> {
    const ex = currentExecutor(this.db);

    const [wo] = await ex.select().from(workOrder).where(eq(workOrder.id, woId)).limit(1);
    if (!wo || wo.status === "COMPLETED" || wo.status === "CANCELLED") return false;

    const steps = await ex
      .select({ status: workOrderStep.status })
      .from(workOrderStep)
      .where(eq(workOrderStep.woId, woId));
    if (steps.length === 0 || !steps.every((s) => s.status === "COMPLETED")) return false;

    await ex
      .update(workOrder)
      .set({ status: "COMPLETED", version: sql`${workOrder.version} + 1` })
      .where(eq(workOrder.id, woId));

    this.events.publishAfterCommit(
      makeEvent<WorkOrderCompletedPayload & { audit: unknown }>({
        event: PRODUCTION_EVENTS.workOrderCompleted,
        actorUserId,
        payload: {
          wo_id: wo.id,
          finished_item_id: wo.finishedItemId,
          warehouse_id: "", // M4 has no warehouse; the backflush consumer defaults it.
          qty_produced: formatQty(wo.qty),
          audit: {
            action: "UPDATE",
            entityType: "work_order",
            entityId: wo.id,
            after: { status: "COMPLETED" },
          },
        },
      }),
    );

    return true;
  }
}
