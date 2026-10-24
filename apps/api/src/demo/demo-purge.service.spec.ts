import { UnrecoverableError, type Queue } from "bullmq";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { Db } from "@erp/db";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import type { PlatformAuditEntry, PlatformAuditService } from "../platform/platform-audit.service.js";
import type { StorageService } from "../storage/storage.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { demoPurgeJobId } from "./demo.constants.js";
import { DemoPurgeService } from "./demo-purge.service.js";
import { demoPurgePlan } from "./demo-purge-plan.js";
import type { DemoStore } from "./demo-store.service.js";

// M10 task 4.3 (`demo-sandbox-purge`) — hard kind assertion, idempotent no-op on a missing tenant,
// reverse-FK deletes → S3 prefix → opt-in lead capture → identity → user → tenant, and audit rows
// that never carry the guest email.

const TID = "00000000-0000-4000-8000-0000000000d1";
const EMAIL = "guest@gmail.com";

interface TenantRow {
  kind: string;
  status: string;
  consentedAt: Date | null;
  name: string | null;
}
type Op = { op: "select" | "update" | "delete" | "insert" | "execute" | "storage"; table: string; values?: unknown };

const tableName = (t: unknown) => (is(t, PgTable) ? getTableConfig(t as PgTable).name : "?");

function setup(initial: TenantRow | null, jobState: string | null = null) {
  let row = initial ? { ...initial } : null;
  const ops: Op[] = [];
  const audits: PlatformAuditEntry[] = [];
  const added: { name: string; data: unknown; opts: Record<string, unknown> }[] = [];
  let removed = 0;

  // A thenable query chain: every builder step returns itself; awaiting yields `result()`.
  const chain = (result: () => unknown) => {
    const q: Record<string, unknown> = {};
    for (const step of ["where", "limit", "for", "orderBy"]) q[step] = () => q;
    q.returning = async () => result();
    q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve().then(result).then(ok, ko);
    return q;
  };
  const tx = {
    select: () => ({
      from: (t: unknown) => {
        const name = tableName(t);
        ops.push({ op: "select", table: name });
        return chain(() => {
          if (name === "tenant") return row ? [row] : [];
          if (name === "auth_identity") return [{ email: EMAIL }];
          return [];
        });
      },
    }),
    update: (t: unknown) => ({
      set: (values: Record<string, unknown>) => {
        const name = tableName(t);
        ops.push({ op: "update", table: name, values });
        return chain(() => {
          if (name !== "tenant" || !row) return [];
          if (values.status === "PURGING" && (row.status !== "ACTIVE" || row.kind !== "DEMO_SANDBOX")) {
            return [];
          }
          if ("demoLeadConsentedAt" in values) row.consentedAt = values.demoLeadConsentedAt as Date | null;
          if (values.status) row.status = values.status as string;
          return [{ id: TID }];
        });
      },
    }),
    delete: (t: unknown) => {
      const name = tableName(t);
      ops.push({ op: "delete", table: name });
      if (name === "tenant") row = null;
      return chain(() => ({ count: 1 }));
    },
    insert: (t: unknown) => ({
      values: (values: unknown) => {
        ops.push({ op: "insert", table: tableName(t), values });
        return chain(() => [{ id: "lead-1" }]);
      },
    }),
    execute: async () => {
      ops.push({ op: "execute", table: "-" });
    },
  };

  const uow = { withTransaction: (fn: (t: unknown) => unknown) => fn(tx) } as unknown as UnitOfWork;
  const audit = {
    append: async (entry: PlatformAuditEntry) => {
      audits.push(entry);
    },
  } as unknown as PlatformAuditService;
  const storage = {
    deleteTenantObjects: async () => {
      ops.push({ op: "storage", table: "s3" });
      return 3;
    },
  } as unknown as StorageService;
  const store = { clearActivity: async () => undefined } as unknown as DemoStore;
  const queue = {
    getJob: async () =>
      jobState === null
        ? undefined
        : {
            getState: async () => jobState,
            remove: async () => {
              removed += 1;
            },
          },
    add: async (name: string, data: unknown, opts: Record<string, unknown>) => {
      added.push({ name, data, opts });
    },
  } as unknown as Queue;

  const service = new DemoPurgeService(tx as unknown as Db, uow, audit, storage, store, queue);
  const run = () => runWithTenant(TID, "job", () => service.runPurge("SIGN_OUT"));
  return { service, run, ops, audits, added, removed: () => removed, row: () => row };
}

const sandbox = (over: Partial<TenantRow> = {}): TenantRow => ({
  kind: "DEMO_SANDBOX",
  status: "PURGING",
  consentedAt: null,
  name: "Guest Name",
  ...over,
});

describe("DemoPurgeService.runPurge", () => {
  it("completes as a no-op when the tenant is already gone", async () => {
    const { run, ops, audits } = setup(null);
    await expect(run()).resolves.toEqual({ purged: true, noop: true });
    expect(ops.filter((o) => o.op !== "select")).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("refuses a non-sandbox tenant: deletes nothing, audits, fails non-retryably", async () => {
    const { run, ops, audits } = setup(sandbox({ kind: "CUSTOMER" }));
    await expect(run()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(ops.filter((o) => o.op === "delete" || o.op === "storage")).toEqual([]);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.after).toMatchObject({ phase: "PURGE_REFUSED", kind: "CUSTOMER" });
  });

  it("leaves a sandbox that is not PURGING untouched", async () => {
    const { run, ops } = setup(sandbox({ status: "ACTIVE" }));
    await expect(run()).resolves.toEqual({ purged: false });
    expect(ops.filter((o) => o.op === "delete" || o.op === "storage")).toEqual([]);
  });

  it("deletes rows in reverse-FK order, then S3, then identity → user → tenant", async () => {
    const { run, ops, audits, row } = setup(sandbox());
    await expect(run()).resolves.toEqual({ purged: true });

    const plan = demoPurgePlan();
    const steps = ops.filter((o) => o.op === "delete" || o.op === "storage").map((o) => o.table);
    expect(steps).toEqual([
      ...plan.bulk.map((t) => t.name),
      "s3",
      "auth_identity",
      "user",
      "tenant",
    ]);
    // Sessions are revoked before anything is deleted.
    const firstDelete = ops.findIndex((o) => o.op === "delete");
    const revoke = ops.findIndex((o) => o.op === "update" && o.table === "session");
    expect(revoke).toBeGreaterThanOrEqual(0);
    expect(revoke).toBeLessThan(firstDelete);
    expect(row()).toBeNull();

    // No consent ⇒ no lead, and no audit payload carries the guest's email.
    expect(ops.some((o) => o.op === "insert" && o.table === "demo_lead")).toBe(false);
    expect(JSON.stringify(audits)).not.toContain(EMAIL);
    expect(audits.at(-1)?.after).toMatchObject({
      phase: "PURGE_COMPLETED",
      trigger: "SIGN_OUT",
      objects: 3,
      lead_captured: false,
    });
  });

  it("captures exactly one demo_lead before the identity/user rows when the guest opted in", async () => {
    const consentedAt = new Date("2026-10-01T00:00:00Z");
    const { run, ops, audits } = setup(sandbox({ consentedAt }));
    await run();

    const leads = ops.filter((o) => o.op === "insert" && o.table === "demo_lead");
    expect(leads).toHaveLength(1);
    expect(leads[0]?.values).toEqual({ email: EMAIL, name: "Guest Name", consentedAt });
    const leadAt = ops.indexOf(leads[0] as Op);
    const identityDelete = ops.findIndex((o) => o.op === "delete" && o.table === "auth_identity");
    expect(leadAt).toBeLessThan(identityDelete);
    // Consent is spent in the same step, so a retry cannot capture twice.
    expect(
      ops.some(
        (o) =>
          o.op === "update" &&
          o.table === "tenant" &&
          (o.values as Record<string, unknown>).demoLeadConsentedAt === null,
      ),
    ).toBe(true);
    expect(audits.some((a) => a.entityType === "demo_lead")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(EMAIL);
  });
});

describe("DemoPurgeService.beginPurge / enqueue", () => {
  it("flips an ACTIVE sandbox to PURGING and enqueues the deduplicated purge job", async () => {
    const { service, added, audits, row } = setup(sandbox({ status: "ACTIVE" }));
    await expect(service.beginPurge(TID, "IDLE")).resolves.toBe(true);
    expect(row()?.status).toBe("PURGING");
    expect(audits[0]).toMatchObject({ before: { status: "ACTIVE" }, after: { status: "PURGING" } });
    await new Promise((r) => setTimeout(r, 0)); // onCommit outside a real tx fires async
    expect(added).toHaveLength(1);
    expect(added[0]?.data).toEqual({ tenantId: TID, trigger: "IDLE" });
    expect(added[0]?.opts).toMatchObject({ jobId: demoPurgeJobId(TID), attempts: 5 });
  });

  it("never touches a non-sandbox tenant", async () => {
    const { service, added } = setup(sandbox({ kind: "CUSTOMER", status: "ACTIVE" }));
    await expect(service.beginPurge(TID, "SIGN_OUT")).resolves.toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(added).toEqual([]);
  });

  it("lets a queued purge absorb a duplicate trigger", async () => {
    const { service, added, removed } = setup(sandbox(), "waiting");
    await service.enqueue(TID, "IDLE");
    expect(added).toEqual([]);
    expect(removed()).toBe(0);
  });

  it("replaces a finished or dead-lettered purge job", async () => {
    const { service, added, removed } = setup(sandbox(), "failed");
    await service.enqueue(TID, "RETRY");
    expect(removed()).toBe(1);
    expect(added).toHaveLength(1);
  });

  it("uses a colon-free job id (BullMQ rejects ':' in custom ids)", () => {
    expect(demoPurgeJobId(TID)).toBe(`demo.purge.${TID}`);
    expect(demoPurgeJobId(TID)).not.toContain(":");
  });
});
