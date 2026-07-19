import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt } from "drizzle-orm";
import { subcontract, workOrder, workOrderStep, type Db } from "@erp/db";
import type {
  ListSubcontractsQuery,
  Subcontract as SubcontractDto,
  SubcontractRequest,
  SubcontractWithContext,
} from "@erp/contracts";
import { decodeCursor } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import { NotFoundError, StateConflictError } from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { PRODUCTION_EVENTS } from "./production.events.js";
import { toSubcontractDto } from "./production.util.js";

/**
 * Subcontracting (task 4.5, spec §4.2, design D5). Sending a step to an outside vendor flips
 * the step to OUTSOURCED and opens a `subcontract` row in SENT with an `sla_due` — the monitor
 * sweep later moves an overdue SENT row to OVERDUE. Receiving returns the step to the line
 * (IN_PROGRESS) and marks the subcontract RECEIVED so the timeline continues.
 */
@Injectable()
export class SubcontractService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly events: EventBusService,
  ) {}

  /** Send a step to a subcontractor: step → OUTSOURCED, subcontract SENT. */
  async send(
    stepId: string,
    body: SubcontractRequest,
    user: AuthUser,
  ): Promise<SubcontractDto> {
    const ex = currentExecutor(this.db);
    const [step] = await ex
      .select()
      .from(workOrderStep)
      .where(eq(workOrderStep.id, stepId))
      .limit(1);
    if (!step) throw new NotFoundError(`Work-order step not found: ${stepId}`);
    if (step.status === "COMPLETED") {
      throw new StateConflictError(`Step ${stepId} is already COMPLETED`);
    }

    await ex
      .update(workOrderStep)
      .set({ status: "OUTSOURCED" })
      .where(eq(workOrderStep.id, stepId));

    const [row] = await ex
      .insert(subcontract)
      .values({
        woStepId: stepId,
        vendor: body.vendor,
        slaDue: new Date(body.sla_due),
        status: "SENT",
      })
      .returning();
    if (!row) throw new NotFoundError("Subcontract creation failed");

    this.events.publishAfterCommit(
      makeEvent({
        event: PRODUCTION_EVENTS.subcontractSent,
        actorUserId: user.id,
        payload: { subcontract_id: row.id, wo_step_id: stepId, vendor: row.vendor },
      }),
    );
    return toSubcontractDto(row);
  }

  /** Receive a subcontracted step back onto the line: subcontract → RECEIVED, step → IN_PROGRESS. */
  async receive(subcontractId: string, user: AuthUser): Promise<SubcontractDto> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(subcontract)
      .where(eq(subcontract.id, subcontractId))
      .limit(1);
    if (!row) throw new NotFoundError(`Subcontract not found: ${subcontractId}`);
    if (row.status === "RECEIVED") {
      throw new StateConflictError(`Subcontract ${subcontractId} is already RECEIVED`);
    }

    const [updated] = await ex
      .update(subcontract)
      .set({ status: "RECEIVED" })
      .where(eq(subcontract.id, subcontractId))
      .returning();

    // Return the step to the line so scanning / completion can continue.
    await ex
      .update(workOrderStep)
      .set({ status: "IN_PROGRESS" })
      .where(eq(workOrderStep.id, row.woStepId));

    this.events.publishAfterCommit(
      makeEvent({
        event: PRODUCTION_EVENTS.subcontractReceived,
        actorUserId: user.id,
        payload: { subcontract_id: row.id, wo_step_id: row.woStepId },
      }),
    );
    return toSubcontractDto(updated ?? row);
  }

  /**
   * Cursor-paginated subcontract list for the SLA tracker (M4 §4.4) — joins the step/work order in
   * so a row can show `wo_no`/`step_name` without the tracker screen doing its own N+1 lookups.
   */
  async list(
    query: ListSubcontractsQuery,
  ): Promise<{ data: SubcontractWithContext[]; next_cursor: string | null }> {
    const ex = currentExecutor(this.db);
    const after = query.cursor ? (decodeCursor(query.cursor) as { id: string }) : null;
    const rows = await ex
      .select({
        subcontract,
        woNo: workOrder.woNo,
        stepName: workOrderStep.name,
      })
      .from(subcontract)
      .innerJoin(workOrderStep, eq(subcontract.woStepId, workOrderStep.id))
      .innerJoin(workOrder, eq(workOrderStep.woId, workOrder.id))
      .where(
        and(
          query.status ? eq(subcontract.status, query.status) : undefined,
          after ? gt(subcontract.id, after.id) : undefined,
        ),
      )
      .orderBy(asc(subcontract.id))
      .limit(query.limit + 1);

    const items = rows.map((r) => ({
      ...toSubcontractDto(r.subcontract),
      wo_no: r.woNo,
      step_name: r.stepName,
    }));
    return buildPage(items, query.limit, (item) => ({ id: item.id }));
  }
}
