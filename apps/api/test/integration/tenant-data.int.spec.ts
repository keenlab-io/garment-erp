import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, createDb, platformAdmin, platformAuditLog, tenant } from "@erp/db";
import { PasswordService } from "../../src/auth/password.service.js";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
} from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { PlatformAuditService } from "../../src/platform/platform-audit.service.js";
import {
  TENANT_EXPORT_JOB,
  TENANT_PURGE_JOB,
  TenantDataService,
} from "../../src/platform/tenant-data.service.js";
import { TenantProvisioningService } from "../../src/platform/tenant-provisioning.service.js";
import { tenantTablesInFkOrder } from "../../src/platform/tenant-tables.js";
import type { StorageService } from "../../src/storage/storage.service.js";
import { tenantPrefix } from "../../src/storage/storage.service.js";
import { currentTenantId, runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

/** In-memory object store honouring the tenant key space exactly like `StorageService`. */
class MemoryStorage {
  readonly objects = new Map<string, Buffer>();
  private prefix(): string {
    const tid = currentTenantId();
    if (tid === null) throw new Error("no tenant scope");
    return tenantPrefix(tid);
  }
  async put(key: string, body: Buffer | string): Promise<void> {
    this.objects.set(`${this.prefix()}${key}`, Buffer.from(body));
  }
  async get(key: string): Promise<Buffer> {
    return this.objects.get(`${this.prefix()}${key}`) ?? Buffer.alloc(0);
  }
  async listTenantObjects(): Promise<string[]> {
    const prefix = this.prefix();
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  }
  async deleteTenantObjects(): Promise<number> {
    const keys = (await this.listTenantObjects()).map((k) => `${this.prefix()}${k}`);
    for (const k of keys) this.objects.delete(k);
    return keys.length;
  }
  async getSignedUrl(key: string, ttl: number): Promise<string> {
    return `https://s3.test/${this.prefix()}${key}?ttl=${ttl}`;
  }
}

/** Records `add()`s and serves `getJob()` from them, with a settable state/return value. */
class FakeQueue {
  readonly jobs = new Map<
    string,
    { id: string; name: string; data: unknown; state: string; returnvalue?: unknown }
  >();
  private seq = 0;
  async add(name: string, data: unknown, opts?: { jobId?: string }) {
    const id = opts?.jobId ?? String(++this.seq);
    const job = { id, name, data, state: "waiting" };
    this.jobs.set(id, job);
    return job;
  }
  async getJob(id: string) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    return {
      ...job,
      getState: async () => job.state,
      remove: async () => void this.jobs.delete(id),
    };
  }
}

// Gated on DATABASE_URL_TEST. M8 §4.3/§4.4 (design D9) — the `tenant.export` job archives one JSONL
// per tenant table plus the tenant's stored objects and is served via a presigned URL; the purge
// is gated (SUSPENDED + typed slug), then deletes every tenant row in reverse-FK order — the
// append-only audit_log included — plus the `tenants/{tid}/` prefix and the tenant row, leaving
// only `platform_audit_log`. Storage and queue are in-memory doubles; Postgres is real.
describe.skipIf(!url)("tenant export & purge (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let provisioning: TenantProvisioningService;
  let data: TenantDataService;
  let storage: MemoryStorage;
  let queue: FakeQueue;
  let platformAdminId: string;
  let tenantId: string;
  let otherTenantId: string;

  const run = randomUUID().slice(0, 8);
  const slug = `purge-${run}`;
  const config = { get: () => 15 } as unknown as ConfigService;

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    const uow = new UnitOfWork(conn.db);
    const audit = new PlatformAuditService(conn.db);
    const passwords = new PasswordService();
    provisioning = new TenantProvisioningService(conn.db, uow, audit, passwords);
    storage = new MemoryStorage();
    queue = new FakeQueue();
    data = new TenantDataService(
      conn.db,
      uow,
      audit,
      storage as unknown as StorageService,
      queue as unknown as Queue,
      config,
    );

    const [row] = await conn.db
      .insert(platformAdmin)
      .values({ email: `purge-ops-${run}@platform.local`, passwordHash: await passwords.hash("pw") })
      .returning({ id: platformAdmin.id });
    platformAdminId = (row as { id: string }).id;

    const provisioned = await provisioning.provisionTenant(
      { name: "Purge Co", slug, domain: `purge-${run}.erp.example`, admin_email: `owner-${run}@purge.example` },
      platformAdminId,
    );
    tenantId = provisioned.tenant.id;
    otherTenantId = (
      await provisioning.provisionTenant({ name: "Bystander", slug: `bystander-${run}` }, platformAdminId)
    ).tenant.id;

    // Tenant business data, including a row in an append-only table, plus a stored object.
    await runWithTenant(tenantId, "system", () =>
      uow.withTransaction((tx) =>
        tx.insert(auditLog).values({ tenantId, action: "CREATE", entityType: "probe", entityId: randomUUID() }),
      ),
    );
    await runWithTenant(tenantId, "job", () => storage.put("payslips/p1.pdf", "%PDF-probe"));
    await runWithTenant(otherTenantId, "job", () => storage.put("payslips/keep.pdf", "keep"));
  });

  afterAll(async () => {
    // Purge the bystander too: other specs read config tables (tax_bracket, …) across tenants.
    if (conn && otherTenantId) {
      await conn.db.update(tenant).set({ status: "PURGING" }).where(eq(tenant.id, otherTenantId));
      await runWithTenant(otherTenantId, "job", () => data.runPurge());
    }
    await conn?.queryClient.end();
  });

  it("exports one JSONL per tenant table plus stored objects, served through a presigned URL", async () => {
    const { job_id } = await data.requestExport(tenantId, { platformAdminId });
    expect(queue.jobs.get(job_id)).toMatchObject({ name: TENANT_EXPORT_JOB, data: { tenantId } });

    const { key } = await runWithTenant(tenantId, "job", () => data.runExport());
    expect(key).toMatch(/^exports\/.+\.zip$/);
    const zip = storage.objects.get(`${tenantPrefix(tenantId)}${key}`);
    if (!zip) throw new Error("export archive was not stored");
    const files = unzipSync(new Uint8Array(zip));

    for (const t of tenantTablesInFkOrder()) {
      expect(files[`tables/${t.name}.jsonl`], `missing ${t.name}.jsonl`).toBeDefined();
    }
    const users = strFromU8(files["tables/user.jsonl"] as Uint8Array).trim().split("\n");
    expect(users).toHaveLength(1);
    const owner = JSON.parse(users[0] as string) as Record<string, unknown>;
    expect(owner).toMatchObject({ email: `owner-${run}@purge.example`, tenantId });
    expect(owner).not.toHaveProperty("passwordHash");
    expect(strFromU8(files["tables/audit_log.jsonl"] as Uint8Array)).toContain('"entityType":"probe"');
    expect(strFromU8(files["objects/payslips/p1.pdf"] as Uint8Array)).toBe("%PDF-probe");
    // Only this tenant's objects — never a bystander's.
    expect(Object.keys(files).some((f) => f.includes("keep.pdf"))).toBe(false);

    // Status: PENDING until the job completes, then DONE with a URL inside the tenant prefix.
    expect(await data.exportStatus(tenantId, job_id)).toEqual({ status: "PENDING" });
    const job = queue.jobs.get(job_id) as { state: string; returnvalue?: unknown };
    job.state = "completed";
    job.returnvalue = { key };
    const done = await data.exportStatus(tenantId, job_id);
    expect(done.status).toBe("DONE");
    expect(done.file_url).toContain(`${tenantPrefix(tenantId)}${key}`);
    expect(done.file_url).toContain(`ttl=${15 * 60}`);
    // Another tenant cannot read this job.
    await expect(data.exportStatus(otherTenantId, job_id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to purge a tenant that is not SUSPENDED (409, no status change) or a wrong confirmation (422)", async () => {
    await expect(data.requestPurge(tenantId, slug, platformAdminId)).rejects.toBeInstanceOf(
      StateConflictError,
    );
    await provisioning.setStatus(tenantId, { status: "READ_ONLY", reason: "unpaid" }, platformAdminId);
    await expect(data.requestPurge(tenantId, slug, platformAdminId)).rejects.toBeInstanceOf(
      StateConflictError,
    );
    await provisioning.setStatus(tenantId, { status: "SUSPENDED", reason: "churned" }, platformAdminId);
    await expect(data.requestPurge(tenantId, "not-the-slug", platformAdminId)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    const [row] = await conn.db.select().from(tenant).where(eq(tenant.id, tenantId));
    expect(row?.status).toBe("SUSPENDED");

    // The append-only trigger still refuses deletes of a merely SUSPENDED tenant's audit rows.
    await expect(
      conn.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.purge_tenant_id', ${tenantId}, true)`);
        await tx.delete(auditLog).where(eq(auditLog.tenantId, tenantId));
      }),
    ).rejects.toThrow();
  });

  it("purges every tenant row and object, leaving platform_audit_log intact; retries are no-ops", async () => {
    const { job_id } = await data.requestPurge(tenantId, slug.toUpperCase(), platformAdminId);
    expect(queue.jobs.get(job_id)).toMatchObject({ name: TENANT_PURGE_JOB, data: { tenantId } });
    const [purging] = await conn.db.select().from(tenant).where(eq(tenant.id, tenantId));
    expect(purging?.status).toBe("PURGING");

    expect(await runWithTenant(tenantId, "job", () => data.runPurge())).toEqual({ purged: true });

    for (const t of tenantTablesInFkOrder()) {
      const [count] = await conn.db
        .select({ n: sql<number>`count(*)::int` })
        .from(t.table)
        .where(eq(t.tenantId, tenantId));
      expect(count?.n, `${t.name} still holds rows of the purged tenant`).toBe(0);
    }
    expect(await conn.db.select().from(tenant).where(eq(tenant.id, tenantId))).toEqual([]);
    expect([...storage.objects.keys()].some((k) => k.startsWith(tenantPrefix(tenantId)))).toBe(false);

    // The bystander tenant is untouched.
    expect(storage.objects.has(`${tenantPrefix(otherTenantId)}payslips/keep.pdf`)).toBe(true);
    expect(await conn.db.select().from(tenant).where(eq(tenant.id, otherTenantId))).toHaveLength(1);

    // The platform ledger survives the tenant and records the whole story.
    const ledger = await conn.db
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.tenantId, tenantId));
    const phases = ledger.map((r) => (r.after as { phase?: string } | null)?.phase).filter(Boolean);
    expect(phases).toEqual(expect.arrayContaining(["PURGE_STARTED", "PURGE_COMPLETED"]));
    expect(
      ledger.some((r) => r.entityType === "tenant" && r.action === "CREATE"),
    ).toBe(true);
    expect(
      ledger.some(
        (r) => r.action === "UPDATE" && (r.after as { status?: string } | null)?.status === "PURGING",
      ),
    ).toBe(true);

    // A redelivered job finds nothing left to do.
    expect(await runWithTenant(tenantId, "job", () => data.runPurge())).toEqual({ purged: true });
    const completions = await conn.db
      .select()
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.tenantId, tenantId),
          sql`${platformAuditLog.after}->>'phase' = 'PURGE_COMPLETED'`,
        ),
      );
    expect(completions).toHaveLength(1);
  });

  it("never purges a tenant that is not PURGING, even if a job is delivered", async () => {
    expect(await runWithTenant(otherTenantId, "job", () => data.runPurge())).toEqual({
      purged: false,
    });
    expect(await conn.db.select().from(tenant).where(eq(tenant.id, otherTenantId))).toHaveLength(1);
  });
});
