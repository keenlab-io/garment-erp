import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_ID,
  createDb,
  documentSequence,
  productionScan,
  routingStep,
  subcontract,
  tenant,
  workOrder,
  workOrderStep,
} from "@erp/db";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { StateConflictError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { DefaultTenantUnitOfWork } from "./tenant-harness.js";
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
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

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
    tenantId: DEFAULT_TENANT_ID,
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
    uow = new DefaultTenantUnitOfWork(conn.db);
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

  it("lists subcontracts with their wo_no/step_name joined in, optionally filtered by status", async () => {
    const tid = await makeTemplate([{ seq: 1, name: "Embroidery", standard_time_min: 15 }]);
    const wo = await makeWorkOrder(tid);
    const [step] = await stepsOf(wo.id);

    const sent = await uow.withTransaction(() =>
      subcontracts.send(step!.id, { vendor: "Acme", sla_due: "2026-01-01T00:00:00.000Z" } as never, actor),
    );

    const page = await subcontracts.list({ limit: 50 } as never);
    const row = page.data.find((r) => r.id === sent.id);
    expect(row).toMatchObject({ wo_no: wo.wo_no, step_name: "Embroidery", status: "SENT" });

    const receivedOnly = await subcontracts.list({ limit: 50, status: "RECEIVED" } as never);
    expect(receivedOnly.data.some((r) => r.id === sent.id)).toBe(false);
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
    // The append-only trigger rejects both UPDATE and DELETE (drizzle wraps the
    // Postgres RAISE message, so assert on the rejection itself).
    await expect(
      conn.db
        .update(productionScan)
        .set({ action: "START" })
        .where(eq(productionScan.id, aScan!.id)),
    ).rejects.toThrow();
    await expect(
      conn.db.delete(productionScan).where(eq(productionScan.id, aScan!.id)),
    ).rejects.toThrow();
  });
});

// M7 §11 — production is per-tenant: `wo_no` numbering + uniqueness are `(tenant_id, wo_no)`,
// the monitor sweep runs per tenant and broadcasts on that tenant's rooms, and scans/lists stay
// inside the caller's tenant. The harness connects as the superuser (RLS bypassed), so these pin
// the services' own tenant predicates.
describe.skipIf(!url)("Production is per-tenant (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let routing: RoutingService;
  let workOrders: WorkOrderService;
  let scans: ScanService;
  let subcontracts: SubcontractService;
  let monitor: ProductionMonitorWorker;
  let tenantB: string;

  const emitted: { room: string; event: string; payload: unknown }[] = [];
  const realtime = {
    emitToRoom: (room: string, event: string, payload: unknown) =>
      emitted.push({ room, event, payload }),
    joinRoom: () => {},
  } as unknown as RealtimeGateway;

  const actorFor = (tenantId: string): AuthUser => ({
    id: randomUUID(),
    sessionId: randomUUID(),
    tenantId,
    isSuperAdmin: true,
    permissions: new Set(),
  });
  const inTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    runWithTenant(tenantId, "jwt", () => uow.withTransaction(fn));

  beforeAll(async () => {
    conn = createDb(url as string, { max: 1 });
    const events = new EventBusService(new EventEmitter2());
    uow = new DefaultTenantUnitOfWork(conn.db);
    const sequences = new SequenceService(conn.db, uow);
    routing = new RoutingService(conn.db);
    workOrders = new WorkOrderService(conn.db, sequences, events);
    scans = new ScanService(conn.db, events, realtime, new CompletionService(conn.db, events));
    subcontracts = new SubcontractService(conn.db, events);
    const config = { get: () => 60_000 } as unknown as ConfigService;
    monitor = new ProductionMonitorWorker(conn.db, {} as Queue, uow, config, events, realtime);

    const [other] = await conn.db
      .insert(tenant)
      .values({ slug: `prod-b-${randomUUID().slice(0, 8)}`, name: "Production tenant B", kind: "CUSTOMER" })
      .returning({ id: tenant.id });
    tenantB = (other as { id: string }).id;

    for (const tenantId of [DEFAULT_TENANT_ID, tenantB]) {
      await conn.db
        .insert(documentSequence)
        .values({
          tenantId,
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
    }
  });

  afterAll(async () => {
    await conn.queryClient.end();
  });

  beforeEach(() => {
    emitted.length = 0;
  });

  async function makeWorkOrder(tenantId: string, standardTimeMin = 30) {
    const template = await inTenant(tenantId, () =>
      routing.create({
        name: `T-${randomUUID().slice(0, 8)}`,
        steps: [{ seq: 1, name: "Sew", standard_time_min: standardTimeMin }] as never,
      }),
    );
    const wo = await inTenant(tenantId, () =>
      workOrders.create(
        {
          finished_item_id: randomUUID() as never,
          qty: "5" as never,
          routing_template_id: template.id as never,
        },
        actorFor(tenantId),
      ),
    );
    const [step] = await conn.db.select().from(workOrderStep).where(eq(workOrderStep.woId, wo.id));
    return { templateId: template.id, wo, stepId: (step as { id: string }).id };
  }

  const woSequence = (tenantId: string) =>
    and(eq(documentSequence.tenantId, tenantId), eq(documentSequence.key, "WORK_ORDER"));

  it("wo_no is numbered and unique per tenant: both tenants may hold the same wo_no", async () => {
    const a = await makeWorkOrder(DEFAULT_TENANT_ID);
    const [seqA] = await conn.db.select().from(documentSequence).where(woSequence(DEFAULT_TENANT_ID));

    // Line tenant B's sequence up so its next number is the one tenant A just minted.
    await conn.db
      .update(documentSequence)
      .set({ currentValue: seqA!.currentValue - 1, yearScope: seqA!.yearScope })
      .where(woSequence(tenantB));
    const b = await makeWorkOrder(tenantB);
    expect(b.wo.wo_no).toBe(a.wo.wo_no);

    const [rowB] = await conn.db.select().from(workOrder).where(eq(workOrder.id, b.wo.id));
    expect(rowB?.tenantId).toBe(tenantB);

    // Within one tenant the same wo_no is still a conflict (the insert rolls the sequence back).
    await conn.db
      .update(documentSequence)
      .set({ currentValue: seqA!.currentValue - 1 })
      .where(woSequence(DEFAULT_TENANT_ID));
    await expect(makeWorkOrder(DEFAULT_TENANT_ID)).rejects.toThrow();
    await conn.db
      .update(documentSequence)
      .set({ currentValue: seqA!.currentValue })
      .where(woSequence(DEFAULT_TENANT_ID));
  });

  it("scans broadcast on the scanning tenant's rooms", async () => {
    const b = await makeWorkOrder(tenantB);

    await inTenant(tenantB, () =>
      scans.scan(b.stepId, { action: "START" } as never, actorFor(tenantB)),
    );

    const rooms = emitted
      .filter((e) => e.event === REALTIME_EVENTS.stepStarted)
      .map((e) => e.room)
      .sort();
    expect(rooms).toEqual([`t:${tenantB}:timeline`, `t:${tenantB}:wo:${b.wo.id}`].sort());
  });

  it("the monitor sweep flags only its own tenant's steps and subcontracts, on its own rooms", async () => {
    const a = await makeWorkOrder(DEFAULT_TENANT_ID, 1);
    const b = await makeWorkOrder(tenantB, 1);
    for (const [tenantId, stepId] of [
      [DEFAULT_TENANT_ID, a.stepId],
      [tenantB, b.stepId],
    ] as const) {
      await inTenant(tenantId, () =>
        scans.scan(stepId, { action: "START" } as never, actorFor(tenantId)),
      );
    }
    const aSc = await makeWorkOrder(DEFAULT_TENANT_ID);
    const sc = await inTenant(DEFAULT_TENANT_ID, () =>
      subcontracts.send(
        aSc.stepId,
        { vendor: "Acme", sla_due: "2026-01-01T00:00:00.000Z" } as never,
        actorFor(DEFAULT_TENANT_ID),
      ),
    );
    emitted.length = 0;

    const later = new Date(Date.now() + 60 * 60_000);
    await inTenant(tenantB, () => monitor.sweep(later));

    const delayed = emitted.filter((e) => e.event === REALTIME_EVENTS.stepDelayed);
    expect(delayed.length).toBeGreaterThan(0);
    expect(delayed.every((e) => e.room.startsWith(`t:${tenantB}:`))).toBe(true);
    expect(delayed.some((e) => (e.payload as { step_id: string }).step_id === a.stepId)).toBe(false);

    const [stepA] = await conn.db.select().from(workOrderStep).where(eq(workOrderStep.id, a.stepId));
    const [stepB] = await conn.db.select().from(workOrderStep).where(eq(workOrderStep.id, b.stepId));
    expect(stepA?.delayNotified).toBe(false);
    expect(stepB?.delayNotified).toBe(true);
    const [scRow] = await conn.db.select().from(subcontract).where(eq(subcontract.id, sc.id));
    expect(scRow?.status).toBe("SENT");

    // Tenant A's own job then flags its step and overdue subcontract, on tenant A's rooms.
    emitted.length = 0;
    await inTenant(DEFAULT_TENANT_ID, () => monitor.sweep(later));
    const [stepAAfter] = await conn.db
      .select()
      .from(workOrderStep)
      .where(eq(workOrderStep.id, a.stepId));
    expect(stepAAfter?.delayNotified).toBe(true);
    const [scAfter] = await conn.db.select().from(subcontract).where(eq(subcontract.id, sc.id));
    expect(scAfter?.status).toBe("OVERDUE");
    expect(emitted.every((e) => e.room.startsWith(`t:${DEFAULT_TENANT_ID}:`))).toBe(true);
  });

  it("timeline, routing and subcontract lists stay inside the caller's tenant", async () => {
    const a = await makeWorkOrder(DEFAULT_TENANT_ID);
    const b = await makeWorkOrder(tenantB);
    const sc = await inTenant(DEFAULT_TENANT_ID, () =>
      subcontracts.send(
        a.stepId,
        { vendor: "Acme", sla_due: "2099-01-01T00:00:00.000Z" } as never,
        actorFor(DEFAULT_TENANT_ID),
      ),
    );

    const timeline = await inTenant(tenantB, () => workOrders.timeline({} as never));
    expect(timeline.some((w) => w.id === b.wo.id)).toBe(true);
    expect(timeline.some((w) => w.id === a.wo.id)).toBe(false);

    const templates = await inTenant(tenantB, () => routing.list({ limit: 500 }));
    expect(templates.data.some((t) => t.id === b.templateId)).toBe(true);
    expect(templates.data.some((t) => t.id === a.templateId)).toBe(false);

    const scsB = await inTenant(tenantB, () => subcontracts.list({ limit: 500 } as never));
    expect(scsB.data.some((r) => r.id === sc.id)).toBe(false);
    const scsA = await inTenant(DEFAULT_TENANT_ID, () => subcontracts.list({ limit: 500 } as never));
    expect(scsA.data.some((r) => r.id === sc.id)).toBe(true);
  });
});
