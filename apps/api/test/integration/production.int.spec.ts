import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  documentSequence,
  productionScan,
  routingStep,
  subcontract,
  workOrder,
  workOrderStep,
} from "@erp/db";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { StateConflictError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import { SequenceService } from "../../src/sequence/sequence.service.js";
import { CompletionService } from "../../src/production/completion.service.js";
import { PRODUCTION_EVENTS, REALTIME_EVENTS } from "../../src/production/production.events.js";
import { ProductionMonitorWorker } from "../../src/production/production-monitor.worker.js";
import { RoutingService } from "../../src/production/routing.service.js";
import { ScanService } from "../../src/production/scan.service.js";
import { SubcontractService } from "../../src/production/subcontract.service.js";
import { WorkOrderService } from "../../src/production/work-order.service.js";
import type { RealtimeGateway } from "../../src/realtime/realtime.gateway.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST (the Testcontainers globalSetup). Drives the M4 production
// services end-to-end against a real Postgres, covering the spec §4.7 acceptance criteria
// (tasks 5.1–5.5): scan/timer + delay detection, subcontract SLA/receive, exactly-one
// completion emission, snapshot isolation, and the re-FINISH 409 + append-only trigger.
describe.skipIf(!url)("Production services (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let events: EventBusService;
  let routing: RoutingService;
  let workOrders: WorkOrderService;
  let scans: ScanService;
  let subcontracts: SubcontractService;
  let monitor: ProductionMonitorWorker;

  // Records realtime room broadcasts + captured domain events for assertions.
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  const domainEvents: { name: string; payload: unknown }[] = [];
  const realtime = {
    emitToRoom: (room: string, event: string, payload: unknown) =>
      emitted.push({ room, event, payload }),
    joinRoom: () => {},
  } as unknown as RealtimeGateway;

  const actor: AuthUser = {
    id: randomUUID(),
    sessionId: randomUUID(),
    isSuperAdmin: true,
    permissions: new Set(),
  };

  beforeAll(async () => {
    conn = createDb(url as string, { max: 1 });
    const emitter = new EventEmitter2();
    emitter.onAny((name: string | string[], payload: unknown) =>
      domainEvents.push({ name: String(name), payload }),
    );
    events = new EventBusService(emitter);
    uow = new UnitOfWork(conn.db);
    const sequences = new SequenceService(conn.db, uow);
    const completion = new CompletionService(conn.db, events);
    routing = new RoutingService(conn.db);
    workOrders = new WorkOrderService(conn.db, sequences, events);
    scans = new ScanService(conn.db, events, realtime, completion);
    subcontracts = new SubcontractService(conn.db, events);
    const config = { get: () => 60_000 } as unknown as ConfigService;
    monitor = new ProductionMonitorWorker(
      conn.db,
      {} as Queue,
      uow,
      config,
      events,
      realtime,
    );

    await conn.db
      .insert(documentSequence)
      .values({
        key: "WORK_ORDER",
        prefix: "WO",
        includeYear: true,
        padding: 4,
        resetYearly: true,
        currentValue: 0,
        format: "{prefix}{yyyy}{seq:0000}",
        yearScope: 2000,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await conn.queryClient.end();
  });

  beforeEach(() => {
    emitted.length = 0;
    domainEvents.length = 0;
  });

  // ── helpers ─────────────────────────────────────────────────────────────────

  async function makeTemplate(
    steps: { seq: number; name: string; standard_time_min: number; department_id?: string }[],
  ): Promise<string> {
    const template = await uow.withTransaction(() =>
      routing.create({ name: `T-${randomUUID().slice(0, 8)}`, steps: steps as never }),
    );
    return template.id;
  }

  async function makeWorkOrder(templateId: string) {
    return uow.withTransaction(() =>
      workOrders.create(
        {
          finished_item_id: randomUUID() as never,
          qty: "10" as never,
          routing_template_id: templateId as never,
        },
        actor,
      ),
    );
  }

  function stepsOf(woId: string) {
    return conn.db
      .select()
      .from(workOrderStep)
      .where(eq(workOrderStep.woId, woId))
      .orderBy(workOrderStep.seq);
  }

  const scan = (stepId: string, action: "START" | "FINISH") =>
    uow.withTransaction(() => scans.scan(stepId, { action } as never, actor));

  const sweep = (now: Date) => uow.withTransaction(() => monitor.sweep(now));

  // ── §5.1 scan + timer + delay detection ───────────────────────────────────────

  it("scan START ⇒ step IN_PROGRESS with a running timer; the monitor flags an overrun once", async () => {
    const tid = await makeTemplate([{ seq: 1, name: "Sew", standard_time_min: 30 }]);
    const wo = await makeWorkOrder(tid);
    const [sew] = await stepsOf(wo.id);

    const started = await scan(sew!.id, "START");
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.started_at).not.toBeNull();
    expect(emitted.some((e) => e.event === REALTIME_EVENTS.stepStarted)).toBe(true);

    // The work order followed the first step into IN_PROGRESS.
    const [woRow] = await conn.db.select().from(workOrder).where(eq(workOrder.id, wo.id));
    expect(woRow?.status).toBe("IN_PROGRESS");

    // 60 minutes later the running step has exceeded its 30-min standard.
    const future = new Date(new Date(started.started_at as string).getTime() + 60 * 60_000);
    const first = await sweep(future);
    expect(first.delayed).toBe(1);
    expect(emitted.some((e) => e.event === REALTIME_EVENTS.stepDelayed)).toBe(true);
    expect(domainEvents.some((e) => e.name === PRODUCTION_EVENTS.stepDelayed)).toBe(true);

    const [afterFlag] = await stepsOf(wo.id);
    expect(afterFlag?.delayNotified).toBe(true);

    // A second sweep is idempotent — no duplicate StepDelayed.
    emitted.length = 0;
    const second = await sweep(future);
    expect(second.delayed).toBe(0);
    expect(emitted.some((e) => e.event === REALTIME_EVENTS.stepDelayed)).toBe(false);
  });

  // ── §5.2 subcontract SLA + overdue + receive ──────────────────────────────────

  it("subcontract a step ⇒ OUTSOURCED + SENT; monitor flips past-SLA → OVERDUE; receive → back on the line", async () => {
    const tid = await makeTemplate([{ seq: 1, name: "Print", standard_time_min: 20 }]);
    const wo = await makeWorkOrder(tid);
    const [print] = await stepsOf(wo.id);

    const slaDue = new Date("2026-01-01T00:00:00.000Z");
    const sc = await uow.withTransaction(() =>
      subcontracts.send(
        print!.id,
        { vendor: "Acme", sla_due: slaDue.toISOString() } as never,
        actor,
      ),
    );
    expect(sc.status).toBe("SENT");
    const [outsourced] = await stepsOf(wo.id);
    expect(outsourced?.status).toBe("OUTSOURCED");

    // The SLA is already in the past → the sweep marks it OVERDUE and emits once.
    const res = await sweep(new Date("2026-02-01T00:00:00.000Z"));
    expect(res.overdue).toBe(1);
    expect(domainEvents.some((e) => e.name === PRODUCTION_EVENTS.subcontractOverdue)).toBe(true);
    const [scRow] = await conn.db.select().from(subcontract).where(eq(subcontract.id, sc.id));
    expect(scRow?.status).toBe("OVERDUE");

    // Receiving returns the step to the line so the timeline continues.
    const received = await uow.withTransaction(() => subcontracts.receive(sc.id, actor));
    expect(received.status).toBe("RECEIVED");
    const [back] = await stepsOf(wo.id);
    expect(back?.status).toBe("IN_PROGRESS");
  });

  // ── §5.3 completion emits exactly one WorkOrderCompleted ───────────────────────

  it("completing the final step ⇒ WO COMPLETED and exactly one WorkOrderCompleted", async () => {
    const tid = await makeTemplate([
      { seq: 1, name: "Cut", standard_time_min: 10 },
      { seq: 2, name: "Sew", standard_time_min: 20 },
    ]);
    const wo = await makeWorkOrder(tid);
    const steps = await stepsOf(wo.id);

    // Finish the first step — WO still in progress, no completion event.
    await scan(steps[0]!.id, "START");
    await scan(steps[0]!.id, "FINISH");
    expect(domainEvents.filter((e) => e.name === PRODUCTION_EVENTS.workOrderCompleted)).toHaveLength(0);

    // Finish the last step — WO completes and emits exactly once.
    await scan(steps[1]!.id, "START");
    await scan(steps[1]!.id, "FINISH");

    const completedEvents = domainEvents.filter(
      (e) => e.name === PRODUCTION_EVENTS.workOrderCompleted,
    );
    expect(completedEvents).toHaveLength(1);
    const payload = completedEvents[0]!.payload as { payload: { wo_id: string; qty_produced: string } };
    expect(payload.payload.wo_id).toBe(wo.id);
    expect(payload.payload.qty_produced).toBe("10.000000");

    const [woRow] = await conn.db.select().from(workOrder).where(eq(workOrder.id, wo.id));
    expect(woRow?.status).toBe("COMPLETED");
  });

  // ── §5.4 template edits don't mutate a live WO's materialized steps ────────────

  it("editing a routing template after a WO exists leaves that WO's materialized steps unchanged", async () => {
    const tid = await makeTemplate([{ seq: 1, name: "Sew", standard_time_min: 30 }]);
    const wo = await makeWorkOrder(tid);
    const [before] = await stepsOf(wo.id);
    expect(before?.name).toBe("Sew");
    expect(before?.standardTimeMin).toBe(30);

    // Mutate the template's step in place.
    await conn.db
      .update(routingStep)
      .set({ name: "Sew (revised)", standardTimeMin: 999 })
      .where(and(eq(routingStep.templateId, tid), eq(routingStep.seq, 1)));

    const [after] = await stepsOf(wo.id);
    expect(after?.name).toBe("Sew");
    expect(after?.standardTimeMin).toBe(30);
  });

  // ── §5.5 re-FINISH ⇒ 409; production_scan is append-only ───────────────────────

  it("re-FINISH on a COMPLETED step ⇒ 409; the production_scan trigger rejects UPDATE/DELETE", async () => {
    const tid = await makeTemplate([{ seq: 1, name: "Pack", standard_time_min: 10 }]);
    const wo = await makeWorkOrder(tid);
    const [pack] = await stepsOf(wo.id);

    await scan(pack!.id, "START");
    await scan(pack!.id, "FINISH");
    await expect(scan(pack!.id, "FINISH")).rejects.toBeInstanceOf(StateConflictError);

    const [aScan] = await conn.db
      .select()
      .from(productionScan)
      .where(eq(productionScan.woStepId, pack!.id))
      .limit(1);
    await expect(
      conn.db
        .update(productionScan)
        .set({ action: "START" })
        .where(eq(productionScan.id, aScan!.id)),
    ).rejects.toThrow(/append-only/);
    await expect(
      conn.db.delete(productionScan).where(eq(productionScan.id, aScan!.id)),
    ).rejects.toThrow(/append-only/);
  });
});
