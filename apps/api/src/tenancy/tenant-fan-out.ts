import { eq } from "drizzle-orm";
import type { JobsOptions } from "bullmq";
import { tenant, type Db } from "@erp/db";
import type { TenantJobData } from "./with-tenant-job.js";

/** The slice of a BullMQ `Queue` the fan-out needs. */
export interface FanOutQueue {
  add(name: string, data: TenantJobData, opts?: JobsOptions): Promise<unknown>;
}

/**
 * Ids of every `ACTIVE` tenant. A system-scoped read of the control-plane `tenant` table (exempt
 * from tenancy/RLS), so it runs on the raw pool with no tenant in scope. Suspended, read-only and
 * purging tenants are skipped — their sweeps do not run.
 */
export async function activeTenantIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: tenant.id }).from(tenant).where(eq(tenant.status, "ACTIVE"));
  return rows.map((r) => r.id);
}

/**
 * One scheduler tick of a repeatable sweep (M7 design D11): enqueue `name` once per active
 * tenant, each payload carrying its `tenantId`, so the sweep itself runs tenant-scoped under
 * `withTenantJob` and a slow tenant never delays another. `tick` (the scheduler job's
 * timestamp) makes the job ids stable per tick, so a redelivered tick does not double-enqueue.
 * Returns the number of tenants fanned out to.
 */
export async function fanOutPerTenant(
  db: Db,
  queue: FanOutQueue,
  name: string,
  tick: number,
): Promise<number> {
  const tenantIds = await activeTenantIds(db);
  for (const tenantId of tenantIds) {
    await queue.add(name, { tenantId }, { jobId: `${name}.${tenantId}.${tick}` });
  }
  return tenantIds.length;
}
