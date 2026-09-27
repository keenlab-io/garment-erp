import type { ConfigService } from "@nestjs/config";
import type { Job, Queue } from "bullmq";
import type { Db } from "@erp/db";
import { describe, expect, it, vi } from "vitest";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import type { EventBusService } from "../events/event-bus.service.js";
import type { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { currentTenantId } from "../tenancy/tenant-context.js";
import { PRODUCTION_MONITOR_JOB, ProductionMonitorWorker } from "./production-monitor.worker.js";

// M7 §11.1 / design D11 — the production monitor runs per tenant: the unscoped scheduler tick
// only fans out one `{ tenantId }` job per ACTIVE tenant, and each per-tenant job runs the sweep
// inside that tenant's transaction.

const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";

function makeWorker() {
  // `activeTenantIds` reads `db.select().from(tenant).where(...)`.
  const db = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve([{ id: TENANT_A }, { id: TENANT_B }]) }),
    }),
  };
  const queue = { add: vi.fn(() => Promise.resolve()) };
  const uow = { withTransaction: vi.fn(<T>(fn: () => Promise<T>) => fn()) };
  const worker = new ProductionMonitorWorker(
    db as unknown as Db,
    queue as unknown as Queue,
    uow as unknown as UnitOfWork,
    { get: () => 60_000 } as unknown as ConfigService,
    {} as EventBusService,
    {} as RealtimeGateway,
  );
  const sweepTenants: (string | null)[] = [];
  const sweep = vi.spyOn(worker, "sweep").mockImplementation(() => {
    sweepTenants.push(currentTenantId());
    return Promise.resolve({ delayed: 0, overdue: 0 });
  });
  return { worker, queue, uow, sweep, sweepTenants };
}

const job = (data: unknown, name = PRODUCTION_MONITOR_JOB, timestamp = 1_700_000_000_000) =>
  ({ id: "1", name, data, timestamp }) as unknown as Job;

describe("ProductionMonitorWorker — per-tenant sweep", () => {
  it("fans the unscoped scheduler tick out per active tenant without sweeping", async () => {
    const { worker, queue, sweep } = makeWorker();

    await worker.process(job({}, PRODUCTION_MONITOR_JOB, 42));

    expect(sweep).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      PRODUCTION_MONITOR_JOB,
      { tenantId: TENANT_A },
      { jobId: `${PRODUCTION_MONITOR_JOB}.${TENANT_A}.42` },
    );
    expect(queue.add).toHaveBeenCalledWith(
      PRODUCTION_MONITOR_JOB,
      { tenantId: TENANT_B },
      { jobId: `${PRODUCTION_MONITOR_JOB}.${TENANT_B}.42` },
    );
  });

  it("runs a per-tenant job's sweep inside that tenant's transaction", async () => {
    const { worker, queue, uow, sweepTenants } = makeWorker();

    await worker.process(job({ tenantId: TENANT_B }));

    expect(queue.add).not.toHaveBeenCalled();
    expect(uow.withTransaction).toHaveBeenCalledOnce();
    expect(sweepTenants).toEqual([TENANT_B]);
  });

  it("ignores other job names sharing the default queue", async () => {
    const { worker, queue, sweep } = makeWorker();

    await worker.process(job({ tenantId: TENANT_A }, "something.else"));

    expect(queue.add).not.toHaveBeenCalled();
    expect(sweep).not.toHaveBeenCalled();
  });
});
