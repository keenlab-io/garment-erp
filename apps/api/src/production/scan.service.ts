import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import {
  defect,
  productionScan,
  workOrder,
  workOrderStep,
  type Db,
} from "@erp/db";
import type {
  Defect as DefectDto,
  HoldRequest,
  RecordDefectRequest,
  ScanRequest,
  WorkOrderStep as WorkOrderStepDto,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { NotFoundError, StateConflictError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { CompletionService } from "./completion.service.js";
import {
  PRODUCTION_EVENTS,
  REALTIME_EVENTS,
  TIMELINE_ROOM,
  type StepEventPayload,
  woRoom,
} from "./production.events.js";
import { toDefectDto, toStepDto } from "./production.util.js";

type WorkOrderStepRow = typeof workOrderStep.$inferSelect;

/**
 * Shop-floor scanning (task 4.3, spec §4.6, design D3/D4). Scans are append-only
 * `production_scan` facts; a step's `started_at`/`finished_at` derive from its earliest START
 * / latest FINISH scan. START sets the step (and the work order, if it's the first) running;
 * FINISH completes it and triggers completion. Re-scanning FINISH on a COMPLETED step → 409.
 * Every transition broadcasts `StepStarted`/`StepFinished` to the `wo:{id}` and `timeline`
 * realtime rooms.
 */
@Injectable()
export class ScanService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly events: EventBusService,
    private readonly realtime: RealtimeGateway,
    private readonly completion: CompletionService,
  ) {}

  /** Scan a step START or FINISH. */
  async scan(
    stepId: string,
    body: ScanRequest,
    user: AuthUser,
  ): Promise<WorkOrderStepDto> {
    const step = await this.loadStep(stepId);

    if (body.action === "FINISH" && step.status === "COMPLETED") {
      throw new StateConflictError(`Step ${stepId} is already COMPLETED`);
    }

    return body.action === "START"
      ? this.start(step, user)
      : this.finish(step, user);
  }

  private async start(step: WorkOrderStepRow, user: AuthUser): Promise<WorkOrderStepDto> {
    const ex = currentExecutor(this.db);
    await ex
      .insert(productionScan)
      .values({ woStepId: step.id, action: "START", byUser: user.id });

    const { startedAt, finishedAt } = await this.deriveTimestamps(step.id);
    const [updated] = await ex
      .update(workOrderStep)
      .set({ startedAt, finishedAt, status: "IN_PROGRESS" })
      .where(eq(workOrderStep.id, step.id))
      .returning();

    // First step to start moves the whole work order to IN_PROGRESS.
    const [wo] = await ex
      .select()
      .from(workOrder)
      .where(eq(workOrder.id, step.woId))
      .limit(1);
    if (wo && wo.status === "PENDING") {
      await ex
        .update(workOrder)
        .set({ status: "IN_PROGRESS", version: sql`${workOrder.version} + 1` })
        .where(eq(workOrder.id, wo.id));
      this.events.publishAfterCommit(
        makeEvent({
          event: PRODUCTION_EVENTS.workOrderStarted,
          actorUserId: user.id,
          payload: { wo_id: wo.id, wo_no: wo.woNo },
        }),
      );
    }

    const dto = toStepDto(updated ?? step, new Date());
    this.broadcast(REALTIME_EVENTS.stepStarted, PRODUCTION_EVENTS.stepStarted, dto, user);
    return dto;
  }

  private async finish(step: WorkOrderStepRow, user: AuthUser): Promise<WorkOrderStepDto> {
    const ex = currentExecutor(this.db);
    await ex
      .insert(productionScan)
      .values({ woStepId: step.id, action: "FINISH", byUser: user.id });

    const derived = await this.deriveTimestamps(step.id);
    // A FINISH with no prior START still bounds the step's duration at the finish instant.
    const startedAt = derived.startedAt ?? derived.finishedAt;
    const [updated] = await ex
      .update(workOrderStep)
      .set({ startedAt, finishedAt: derived.finishedAt, status: "COMPLETED" })
      .where(eq(workOrderStep.id, step.id))
      .returning();

    const dto = toStepDto(updated ?? step, new Date());
    this.broadcast(REALTIME_EVENTS.stepFinished, PRODUCTION_EVENTS.stepFinished, dto, user);

    await this.completion.maybeComplete(step.woId, user.id);
    return dto;
  }

  /** Put a step on hold with a reason (side-branch off the line). */
  async hold(stepId: string, body: HoldRequest, user: AuthUser): Promise<WorkOrderStepDto> {
    const step = await this.loadStep(stepId);
    if (step.status === "COMPLETED") {
      throw new StateConflictError(`Step ${stepId} is already COMPLETED`);
    }
    const ex = currentExecutor(this.db);
    const [updated] = await ex
      .update(workOrderStep)
      .set({ status: "HOLD" })
      .where(eq(workOrderStep.id, stepId))
      .returning();

    this.events.publishAfterCommit(
      makeEvent({
        event: PRODUCTION_EVENTS.stepHeld,
        actorUserId: user.id,
        payload: { wo_id: step.woId, step_id: stepId, reason: body.reason },
      }),
    );
    return toStepDto(updated ?? step, new Date());
  }

  /** Record a defect against a step. */
  async recordDefect(
    stepId: string,
    body: RecordDefectRequest,
    user: AuthUser,
  ): Promise<DefectDto> {
    const step = await this.loadStep(stepId);
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .insert(defect)
      .values({
        woStepId: step.id,
        type: body.type,
        qty: body.qty,
        note: body.note ?? null,
      })
      .returning();
    if (!row) throw new NotFoundError("Defect creation failed");

    this.events.publishAfterCommit(
      makeEvent({
        event: PRODUCTION_EVENTS.defectRecorded,
        actorUserId: user.id,
        payload: { wo_id: step.woId, step_id: step.id, defect_id: row.id, type: row.type },
      }),
    );
    return toDefectDto(row);
  }

  /** Load a step or 404. */
  private async loadStep(stepId: string): Promise<WorkOrderStepRow> {
    const ex = currentExecutor(this.db);
    const [step] = await ex
      .select()
      .from(workOrderStep)
      .where(eq(workOrderStep.id, stepId))
      .limit(1);
    if (!step) throw new NotFoundError(`Work-order step not found: ${stepId}`);
    return step;
  }

  /** Derive a step's timestamps from its scan set: earliest START, latest FINISH. */
  private async deriveTimestamps(
    stepId: string,
  ): Promise<{ startedAt: Date | null; finishedAt: Date | null }> {
    const ex = currentExecutor(this.db);
    const scans = await ex
      .select({ action: productionScan.action, at: productionScan.at })
      .from(productionScan)
      .where(eq(productionScan.woStepId, stepId))
      .orderBy(asc(productionScan.at));

    const starts = scans.filter((s) => s.action === "START").map((s) => s.at.getTime());
    const finishes = scans.filter((s) => s.action === "FINISH").map((s) => s.at.getTime());
    return {
      startedAt: starts.length ? new Date(Math.min(...starts)) : null,
      finishedAt: finishes.length ? new Date(Math.max(...finishes)) : null,
    };
  }

  /** Push a step transition to the realtime rooms and publish the domain event. */
  private broadcast(
    realtimeEvent: string,
    domainEvent: string,
    step: WorkOrderStepDto,
    user: AuthUser,
  ): void {
    const payload: StepEventPayload = {
      wo_id: step.wo_id,
      step_id: step.id,
      seq: step.seq,
      name: step.name,
      status: step.status,
    };
    this.realtime.emitToRoom(woRoom(step.wo_id), realtimeEvent, payload);
    this.realtime.emitToRoom(TIMELINE_ROOM, realtimeEvent, payload);
    this.events.publishAfterCommit(
      makeEvent({ event: domainEvent, actorUserId: user.id, payload }),
    );
  }
}
