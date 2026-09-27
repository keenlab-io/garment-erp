import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, tenant, uom } from "@erp/db";
import { BusinessRuleError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import {
  activeTenantIds,
  fanOutPerTenant,
  type FanOutQueue,
} from "../../src/tenancy/tenant-fan-out.js";
import { withTenantJob, type TenantJobData } from "../../src/tenancy/with-tenant-job.js";
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;
const appUrl = process.env.DATABASE_URL_TEST_APP;

/** A `FanOutQueue` that just records every `add()` call. */
class RecordingQueue implements FanOutQueue {
  calls: { name: string; data: TenantJobData }[] = [];
  async add(name: string, data: TenantJobData): Promise<void> {
    this.calls.push({ name, data });
  }
}

// Gated on DATABASE_URL_TEST(_APP). M7 task 15.5 — the sweep scheduler tick against real
// Postgres: `activeTenantIds`/`fanOutPerTenant` (M7 design D11) fan out to ACTIVE tenants only —
// a SUSPENDED tenant's sweep never runs — and `withTenantJob` (the worker-side first line)
// really does set `app.tenant_id` for the job's writes, proven against the RLS-bound `erp_app`
// role (the superuser test connection would bypass RLS and hide nothing).
describe.skipIf(!url || !appUrl)("sweep fan-out & withTenantJob (integration)", () => {
  let admin: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;
  let appUow: UnitOfWork;

  const TENANT_ACTIVE = randomUUID();
  const TENANT_SUSPENDED = randomUUID();
  const JOB_NAME = `test.sweep.${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    admin = createDb(url as string, { max: 5 });
    app = createDb(appUrl as string, { max: 5 });
    appUow = new UnitOfWork(app.db);

    await admin.db.insert(tenant).values([
      {
        id: TENANT_ACTIVE,
        slug: `sweep-active-${TENANT_ACTIVE.slice(0, 8)}`,
        name: "Sweep Active",
        kind: "CUSTOMER",
        status: "ACTIVE",
      },
      {
        id: TENANT_SUSPENDED,
        slug: `sweep-suspended-${TENANT_SUSPENDED.slice(0, 8)}`,
        name: "Sweep Suspended",
        kind: "CUSTOMER",
        status: "SUSPENDED",
      },
    ]);
  });

  afterAll(async () => {
    await admin?.queryClient.end();
    await app?.queryClient.end();
  });

  it("activeTenantIds / a scheduler tick includes the ACTIVE tenant and skips the SUSPENDED one", async () => {
    const ids = await activeTenantIds(admin.db);
    expect(ids).toContain(TENANT_ACTIVE);
    expect(ids).not.toContain(TENANT_SUSPENDED);

    const queue = new RecordingQueue();
    await fanOutPerTenant(admin.db, queue, JOB_NAME, Date.now());

    const tenantsFannedTo = new Set(queue.calls.filter((c) => c.name === JOB_NAME).map((c) => c.data.tenantId));
    expect(tenantsFannedTo.has(TENANT_ACTIVE)).toBe(true);
    expect(tenantsFannedTo.has(TENANT_SUSPENDED)).toBe(false);
  });

  it("a hand-enqueued job without tenantId fails instead of running unscoped", async () => {
    await expect(
      withTenantJob({ name: JOB_NAME, data: {} }, async () => {
        throw new Error("must not run");
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("withTenantJob sets the GUC: a job's writes land under, and only under, its own tenant", async () => {
    const queue = new RecordingQueue();
    await fanOutPerTenant(admin.db, queue, JOB_NAME, Date.now());
    const job = queue.calls.find((c) => c.data.tenantId === TENANT_ACTIVE);
    if (!job) throw new Error("expected a fanned-out job for the active tenant");

    const code = `SWEEP-${randomUUID().slice(0, 8)}`;
    await withTenantJob(job, () =>
      appUow.withTransaction((tx) => tx.insert(uom).values({ code, name: "Sweep probe" })),
    );

    // Visible under the job's own tenant…
    const seenByOwner = await runWithTenant(TENANT_ACTIVE, "job", () =>
      appUow.withTransaction((tx) => tx.select().from(uom).where(eq(uom.code, code))),
    );
    expect(seenByOwner).toHaveLength(1);

    // …invisible under an unrelated tenant's scope (RLS, not application filtering).
    const seenByOther = await runWithTenant(TENANT_SUSPENDED, "job", () =>
      appUow.withTransaction((tx) => tx.select().from(uom).where(eq(uom.code, code))),
    );
    expect(seenByOther).toEqual([]);

    await admin.db.delete(uom).where(eq(uom.code, code));
  });
});
