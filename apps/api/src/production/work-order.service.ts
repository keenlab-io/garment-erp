import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  defect,
  routingStep,
  routingTemplate,
  workOrder,
  workOrderStep,
  type Db,
} from "@erp/db";
import type {
  CreateWorkOrderRequest,
  WorkOrder as WorkOrderDto,
  WorkOrderDetail,
  WorkOrderTimelineEntry,
  WorkOrderTimelineQuery,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { SequenceService } from "../sequence/sequence.service.js";
import { PRODUCTION_EVENTS } from "./production.events.js";
import { toDefectDto, toStepDto, toWorkOrderDto } from "./production.util.js";

/**
 * Work orders (task 4.2, spec §4.2). Creating a WO issues its `wo_no` from the `WORK_ORDER`
 * sequence and **materializes** a `work_order_step` snapshot from the routing template's steps
 * (design D1) — copying `seq`/`name`/`standard_time_min` so a later template edit never mutates
 * a live WO. Detail and the timeline/Gantt feed compute `is_delayed` on read (design D4/D9).
 */
@Injectable()
export class WorkOrderService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sequences: SequenceService,
    private readonly events: EventBusService,
  ) {}

  /** Create a work order: issue `wo_no`, snapshot the template's steps, emit `WorkOrderCreated`. */
  async create(input: CreateWorkOrderRequest, user: AuthUser): Promise<WorkOrderDto> {
    const ex = currentExecutor(this.db);

    const [template] = await ex
      .select({ id: routingTemplate.id })
      .from(routingTemplate)
      .where(eq(routingTemplate.id, input.routing_template_id))
      .limit(1);
    if (!template) {
      throw new NotFoundError(`Routing template not found: ${input.routing_template_id}`);
    }

    const steps = await ex
      .select()
      .from(routingStep)
      .where(eq(routingStep.templateId, template.id))
      .orderBy(asc(routingStep.seq));
    if (steps.length === 0) {
      throw new NotFoundError(`Routing template has no steps: ${template.id}`);
    }

    const woNo = await this.sequences.next("WORK_ORDER");

    const [wo] = await ex
      .insert(workOrder)
      .values({
        woNo,
        customerId: input.customer_id ?? null,
        finishedItemId: input.finished_item_id,
        qty: input.qty,
        dueDate: input.due_date ?? null,
        routingTemplateId: template.id,
        machine: input.machine ?? null,
        mockupFileKey: input.mockup_file_key ?? null,
      })
      .returning();
    if (!wo) throw new NotFoundError("Work order creation failed");

    // Snapshot each routing step into a materialized work-order step.
    await ex.insert(workOrderStep).values(
      steps.map((s) => ({
        woId: wo.id,
        routingStepId: s.id,
        seq: s.seq,
        name: s.name,
        standardTimeMin: s.standardTimeMin,
      })),
    );

    this.events.publishAfterCommit(
      makeEvent({
        event: PRODUCTION_EVENTS.workOrderCreated,
        actorUserId: user.id,
        payload: { wo_id: wo.id, wo_no: wo.woNo },
      }),
    );

    return toWorkOrderDto(wo);
  }

  /** `GET /work-orders/{id}` — the work order plus its materialized steps and defects. */
  async detail(id: string): Promise<WorkOrderDetail> {
    const ex = currentExecutor(this.db);
    const now = new Date();

    const [wo] = await ex.select().from(workOrder).where(eq(workOrder.id, id)).limit(1);
    if (!wo) throw new NotFoundError(`Work order not found: ${id}`);

    const steps = await ex
      .select()
      .from(workOrderStep)
      .where(eq(workOrderStep.woId, id))
      .orderBy(asc(workOrderStep.seq));

    const stepIds = steps.map((s) => s.id);
    const defects = stepIds.length
      ? await ex.select().from(defect).where(inArray(defect.woStepId, stepIds))
      : [];

    return {
      work_order: toWorkOrderDto(wo),
      steps: steps.map((s) => toStepDto(s, now)),
      defects: defects.map(toDefectDto),
    };
  }

  /**
   * `GET /work-orders/timeline` — the Gantt feed: work orders (optionally filtered by status
   * and a `from`/`to` window on step activity) with their steps and computed `is_delayed`.
   */
  async timeline(query: WorkOrderTimelineQuery): Promise<WorkOrderTimelineEntry[]> {
    const ex = currentExecutor(this.db);
    const now = new Date();

    const wos = await ex
      .select()
      .from(workOrder)
      .where(query.status ? eq(workOrder.status, query.status) : undefined)
      .orderBy(asc(workOrder.woNo));
    if (wos.length === 0) return [];

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const woIds = wos.map((w) => w.id);
    const stepFilters = [inArray(workOrderStep.woId, woIds)];
    if (from) stepFilters.push(gte(workOrderStep.startedAt, from));
    if (to) stepFilters.push(lte(workOrderStep.startedAt, to));
    const steps = await ex
      .select()
      .from(workOrderStep)
      .where(and(...stepFilters))
      .orderBy(asc(workOrderStep.seq));

    const byWo = new Map<string, typeof steps>();
    for (const s of steps) {
      const list = byWo.get(s.woId) ?? [];
      list.push(s);
      byWo.set(s.woId, list);
    }

    // With a time window, only surface work orders that have step activity in range.
    const windowed = Boolean(from || to);
    return wos
      .filter((w) => !windowed || byWo.has(w.id))
      .map((w) => ({
        id: w.id,
        wo_no: w.woNo,
        customer_id: w.customerId,
        due_date: w.dueDate,
        status: w.status,
        steps: (byWo.get(w.id) ?? []).map((s) => toStepDto(s, now)),
      }));
  }
}
