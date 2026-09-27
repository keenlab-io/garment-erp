import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import { currentTenantId } from "../tenancy/tenant-context.js";
import type { ExportService } from "./export.service.js";
import type { PayrollService } from "./payroll.service.js";
import { PayrollWorker } from "./payroll.worker.js";
import { PROBATION_SCAN_JOB, type ProbationService } from "./probation.service.js";

// M7 §9.2 / design D11 — the probation scan runs per tenant: the unscoped scheduler tick only
// fans out, and each per-tenant job (payload `{ tenantId }`) runs the scan in that tenant.

const TENANT = "00000000-0000-4000-8000-00000000000a";

function makeWorker() {
  const scanTenants: (string | null)[] = [];
  const probation = {
    fanOut: vi.fn(() => Promise.resolve(2)),
    scan: vi.fn(() => {
      scanTenants.push(currentTenantId());
      return Promise.resolve(0);
    }),
  };
  const uow = { withTransaction: vi.fn(<T>(fn: () => Promise<T>) => fn()) };
  const worker = new PayrollWorker(
    uow as unknown as UnitOfWork,
    {} as PayrollService,
    {} as ExportService,
    probation as unknown as ProbationService,
  );
  return { worker, probation, uow, scanTenants };
}

const job = (data: unknown, timestamp = 1_700_000_000_000) =>
  ({ id: "1", name: PROBATION_SCAN_JOB, data, timestamp }) as unknown as Job;

describe("PayrollWorker — probation scan", () => {
  it("fans the unscoped scheduler tick out per tenant without scanning", async () => {
    const { worker, probation } = makeWorker();

    await worker.process(job({}, 42));

    expect(probation.fanOut).toHaveBeenCalledWith(42);
    expect(probation.scan).not.toHaveBeenCalled();
  });

  it("runs a per-tenant job's scan inside that tenant's transaction", async () => {
    const { worker, probation, uow, scanTenants } = makeWorker();

    await worker.process(job({ tenantId: TENANT }));

    expect(probation.fanOut).not.toHaveBeenCalled();
    expect(uow.withTransaction).toHaveBeenCalledOnce();
    expect(scanTenants).toEqual([TENANT]);
  });
});
