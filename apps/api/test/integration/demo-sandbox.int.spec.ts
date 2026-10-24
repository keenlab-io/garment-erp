import { randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authIdentity,
  createDb,
  demoLead,
  invoice,
  payrollRun,
  platformAuditLog,
  productionScan,
  tenant,
  user,
  workOrder,
  workOrderStep,
} from "@erp/db";
import { PasswordService } from "../../src/auth/password.service.js";
import { ServiceUnavailableError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { DemoProvisioningService } from "../../src/demo/demo-provisioning.service.js";
import { demoPurgeJobId } from "../../src/demo/demo.constants.js";
import { DemoSweepService } from "../../src/demo/demo-sweep.service.js";
import { DemoPurgeService } from "../../src/demo/demo-purge.service.js";
import { demoPurgePlan } from "../../src/demo/demo-purge-plan.js";
import type { DemoSignupSlot, DemoStore } from "../../src/demo/demo-store.service.js";
import type { AuthService } from "../../src/iam/auth.service.js";
import { PlatformAuditService } from "../../src/platform/platform-audit.service.js";
import type { StorageService } from "../../src/storage/storage.service.js";
import { tenantPrefix } from "../../src/storage/storage.service.js";
import { currentTenantId, runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

/** In-memory object store honouring the tenant key space like `StorageService`. */
class MemoryStorage {
  readonly objects = new Map<string, Buffer>();
  private prefix(): string {
    const tid = currentTenantId();
    if (tid === null) throw new Error("no tenant scope");
    return tenantPrefix(tid);
  }
  async put(key: string, body: string): Promise<void> {
    this.objects.set(`${this.prefix()}${key}`, Buffer.from(body));
  }
  async deleteTenantObjects(): Promise<number> {
    const prefix = this.prefix();
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix));
    for (const k of keys) this.objects.delete(k);
    return keys.length;
  }
}

/** Records `add()`s and serves `getJob()` from them. */
class FakeQueue {
  readonly jobs = new Map<string, { name: string; data: unknown; state: string }>();
  async add(name: string, data: unknown, opts?: { jobId?: string }) {
    this.jobs.set(opts?.jobId ?? randomUUID(), { name, data, state: "waiting" });
  }
  async getJob(id: string) {
    const job = this.jobs.get(id);
    return job && { ...job, getState: async () => job.state, remove: async () => this.jobs.delete(id) };
  }
}

// Gated on DATABASE_URL_TEST. M10 §4 against real Postgres (RLS, FK order, migration 0017's
// append-only escape hatch): a provisioned sandbox holds the seeded factory + guest; the purge
// leaves no row for its tenant_id in any tenant table, no object under its prefix, and no trace of
// the guest email outside an opted-in `demo_lead`; the cap holds under concurrent callbacks.
describe.skipIf(!url)("demo sandbox provisioning & purge (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let provisioning: DemoProvisioningService;
  let purge: DemoPurgeService;
  let storage: MemoryStorage;
  let queue: FakeQueue;
  const created: string[] = [];
  const env: Record<string, number> = {
    DEMO_SIGNUP_RATE_PER_IP: 100,
    DEMO_SIGNUP_RATE_PER_EMAIL: 100,
    DEMO_MAX_CONCURRENT_SANDBOXES: 1_000,
  };

  beforeAll(async () => {
    conn = createDb(url as string, { max: 6 });
    uow = new UnitOfWork(conn.db);
    const audit = new PlatformAuditService(conn.db);
    // Token issuance is AuthService's (covered by the IAM suites); here it only has to find the
    // GOOGLE identity inside the provisioning transaction.
    const auth = {
      signInWithIdentity: async (tid: string, _p: string, sub: string) => {
        const [found] = await uow.withTransaction((tx) =>
          tx
            .select({ id: authIdentity.id })
            .from(authIdentity)
            .where(and(eq(authIdentity.tenantId, tid), eq(authIdentity.subject, sub))),
        );
        return found ? { access_token: `a-${tid}`, refresh_token: "r", expires_in: 900 } : null;
      },
    } as unknown as AuthService;
    const store = {
      takeSignupSlot: async (): Promise<DemoSignupSlot> => ({
        ipKey: null,
        emailKey: "k",
        ipCount: 0,
        emailCount: 1,
      }),
      releaseSignupSlot: async () => undefined,
      clearActivity: async () => undefined,
    } as unknown as DemoStore;
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    storage = new MemoryStorage();
    queue = new FakeQueue();
    provisioning = new DemoProvisioningService(
      conn.db,
      uow,
      auth,
      new PasswordService(),
      audit,
      store,
      config,
    );
    purge = new DemoPurgeService(
      conn.db,
      uow,
      audit,
      storage as unknown as StorageService,
      store,
      queue as unknown as Queue,
    );
  });

  afterAll(async () => {
    // Leave no sandbox behind: other specs read config tables (tax_bracket, …) across tenants.
    for (const tid of created) {
      await purge.beginPurge(tid, "SIGN_OUT");
      await runWithTenant(tid, "job", () => purge.runPurge("SIGN_OUT"));
    }
    await conn?.queryClient.end();
  });

  async function provisionGuest(email: string) {
    const tokens = await provisioning.provision(
      { sub: `sub-${randomUUID()}`, email, name: "คุณทดสอบ" },
      { ip: null },
    );
    const tid = tokens.access_token.slice(2);
    created.push(tid);
    return tid;
  }

  async function rowsFor(tid: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    await runWithTenant(tid, "system", () =>
      uow.withTransaction(async (tx) => {
        const plan = demoPurgePlan();
        for (const t of [...plan.bulk, ...plan.tail]) {
          const [r] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(t.table)
            .where(eq(t.tenantId, tid));
          if ((r?.n ?? 0) > 0) counts[t.name] = r?.n ?? 0;
        }
      }),
    );
    return counts;
  }

  async function signOutAndPurge(tid: string) {
    await purge.beginPurge(tid, "SIGN_OUT");
    return runWithTenant(tid, "job", () => purge.runPurge("SIGN_OUT"));
  }

  it("provisions a seeded DEMO_SANDBOX with a super-admin guest", async () => {
    const tid = await provisionGuest(`guest-${randomUUID()}@gmail.com`);
    const [t] = await conn.db.select().from(tenant).where(eq(tenant.id, tid));
    expect(t).toMatchObject({ kind: "DEMO_SANDBOX", status: "ACTIVE", allowSelfSignup: true });
    const counts = await rowsFor(tid);
    expect(counts.work_order).toBeGreaterThan(0);
    expect(counts.invoice).toBeGreaterThan(0);
    expect(counts.tenant_feature).toBeGreaterThan(0);
    const guests = await runWithTenant(tid, "system", () =>
      uow.withTransaction((tx) => tx.select().from(user).where(eq(user.tenantId, tid))),
    );
    expect(guests).toHaveLength(1);
    expect(guests[0]?.isSuperAdmin).toBe(true);
  });

  it("purges every row, object, identity, user and the tenant — no email left behind", async () => {
    const email = `gone-${randomUUID()}@gmail.com`;
    const tid = await provisionGuest(email);
    await runWithTenant(tid, "job", () => storage.put("payslips/p.pdf", "%PDF"));

    await expect(signOutAndPurge(tid)).resolves.toEqual({ purged: true });

    expect(await rowsFor(tid)).toEqual({});
    expect([...storage.objects.keys()].some((k) => k.startsWith(tenantPrefix(tid)))).toBe(false);
    expect(await conn.db.select().from(tenant).where(eq(tenant.id, tid))).toEqual([]);
    const audits = await conn.db
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.tenantId, tid));
    expect(audits.some((a) => (a.after as { phase?: string } | null)?.phase === "PURGE_COMPLETED")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(email);
    expect(await conn.db.select().from(demoLead).where(eq(demoLead.email, email))).toEqual([]);

    // A retry (or duplicate trigger) after completion is a no-op success.
    await expect(runWithTenant(tid, "job", () => purge.runPurge("RETRY"))).resolves.toEqual({
      purged: true,
      noop: true,
    });
  });

  it("captures exactly one demo_lead when the guest opted in", async () => {
    const email = `lead-${randomUUID()}@gmail.com`;
    const tid = await provisionGuest(email);
    await provisioning.setLeadOptIn(tid, true);
    await signOutAndPurge(tid);
    const leads = await conn.db.select().from(demoLead).where(eq(demoLead.email, email));
    expect(leads).toHaveLength(1);
    expect(leads[0]?.name).toBe("คุณทดสอบ");
  });

  it("seeds a factory that tells the demo story (7.4)", async () => {
    const tid = await provisionGuest(`seed-${randomUUID()}@gmail.com`);
    await runWithTenant(tid, "system", () =>
      uow.withTransaction(async (tx) => {
        const steps = await tx.select().from(workOrderStep).where(eq(workOrderStep.tenantId, tid));
        const scans = await tx.select().from(productionScan).where(eq(productionScan.tenantId, tid));
        const orders = await tx.select().from(workOrder).where(eq(workOrder.tenantId, tid));
        expect(orders.some((w) => w.status === "IN_PROGRESS")).toBe(true);
        expect(scans.length).toBeGreaterThan(0);
        // A delayed step: running (or finished) for longer than its standard time.
        const now = Date.now();
        expect(
          steps.some(
            (s) =>
              s.startedAt !== null &&
              (s.finishedAt?.getTime() ?? now) - s.startedAt.getTime() > s.standardTimeMin * 60_000,
          ),
        ).toBe(true);
        const runs = await tx.select().from(payrollRun).where(eq(payrollRun.tenantId, tid));
        expect(runs.some((r) => r.status === "PAID")).toBe(true);
        const states = new Set(
          (await tx.select().from(invoice).where(eq(invoice.tenantId, tid))).map((i) => i.status),
        );
        for (const st of ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"]) {
          expect(states.has(st as never)).toBe(true);
        }
      }),
    );
  });

  it.skipIf(!process.env.DATABASE_URL_TEST_APP)(
    "isolates two guests' sandboxes under RLS (7.3)",
    async () => {
      const a = await provisionGuest(`iso-a-${randomUUID()}@gmail.com`);
      const b = await provisionGuest(`iso-b-${randomUUID()}@gmail.com`);
      expect(a).not.toBe(b);
      // As the runtime role (RLS enforced): each guest sees only their own factory.
      const app = createDb(process.env.DATABASE_URL_TEST_APP as string, { max: 1 });
      try {
        const seenBy = (tid: string) =>
          app.db.transaction(async (tx) => {
            await tx.execute(sql`SELECT set_config('app.tenant_id', ${tid}, true)`);
            return tx.select({ tid: workOrder.tenantId }).from(workOrder);
          });
        const [fromA, fromB] = [await seenBy(a), await seenBy(b)];
        expect(fromA.length).toBeGreaterThan(0);
        expect(fromA.every((r) => r.tid === a)).toBe(true);
        expect(fromB.length).toBeGreaterThan(0);
        expect(fromB.every((r) => r.tid === b)).toBe(true);
      } finally {
        await app.queryClient.end();
      }
    },
  );

  it("finishes a purge that died mid-way when retried (7.5)", async () => {
    const tid = await provisionGuest(`kill-${randomUUID()}@gmail.com`);
    await runWithTenant(tid, "job", () => storage.put("files/f.pdf", "%PDF"));
    await purge.beginPurge(tid, "SIGN_OUT");
    // Kill the worker at the object-store step: business rows are already gone by then.
    const real = storage.deleteTenantObjects.bind(storage);
    storage.deleteTenantObjects = async () => {
      throw new Error("worker killed");
    };
    await expect(runWithTenant(tid, "job", () => purge.runPurge("SIGN_OUT"))).rejects.toThrow(
      "worker killed",
    );
    storage.deleteTenantObjects = real;
    expect((await conn.db.select().from(tenant).where(eq(tenant.id, tid)))[0]?.status).toBe("PURGING");

    await expect(runWithTenant(tid, "job", () => purge.runPurge("RETRY"))).resolves.toEqual({
      purged: true,
    });
    expect(await rowsFor(tid)).toEqual({});
    expect(await conn.db.select().from(tenant).where(eq(tenant.id, tid))).toEqual([]);
  });

  it("the sweep purges an abandoned sandbox and re-enqueues a stuck purge (7.6)", async () => {
    const abandoned = await provisionGuest(`idle-${randomUUID()}@gmail.com`);
    const stuck = await provisionGuest(`stuck-${randomUUID()}@gmail.com`);
    await purge.beginPurge(stuck, "SIGN_OUT");
    queue.jobs.clear(); // the purge job was lost

    const sweep = new DemoSweepService(
      conn.db,
      uow,
      purge,
      { lastActivity: async () => null } as unknown as DemoStore,
      { get: (k: string) => (k === "DEMO_SANDBOX_IDLE_MINUTES" ? 60 : undefined) } as unknown as ConfigService,
    );
    const result = await sweep.sweep();
    expect(result.failed).toBe(0);
    const status = async (tid: string) =>
      (await conn.db.select().from(tenant).where(eq(tenant.id, tid)))[0]?.status;
    expect(await status(abandoned)).toBe("PURGING");
    expect(queue.jobs.has(demoPurgeJobId(stuck))).toBe(true);
    expect(queue.jobs.has(demoPurgeJobId(abandoned))).toBe(true);
    expect(await status(stuck)).toBe("PURGING");
  });

  it("holds the concurrent cap under simultaneous first sign-ins", async () => {
    const [{ n }] = (await conn.db
      .select({ n: sql<number>`count(*)::int` })
      .from(tenant)
      .where(and(eq(tenant.kind, "DEMO_SANDBOX"), eq(tenant.status, "ACTIVE")))) as [{ n: number }];
    env.DEMO_MAX_CONCURRENT_SANDBOXES = n + 1;
    try {
      const results = await Promise.allSettled(
        [1, 2, 3].map((i) => provisionGuest(`race-${i}-${randomUUID()}@gmail.com`)),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(rejected).toHaveLength(2);
      for (const r of rejected) expect(r.reason).toBeInstanceOf(ServiceUnavailableError);
    } finally {
      env.DEMO_MAX_CONCURRENT_SANDBOXES = 1_000;
    }
  });
});
