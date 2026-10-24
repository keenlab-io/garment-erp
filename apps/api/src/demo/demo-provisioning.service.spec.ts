import type { ConfigService } from "@nestjs/config";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@erp/db";
import type { PasswordService } from "../auth/password.service.js";
import { RateLimitedError, ServiceUnavailableError } from "../common/errors/app-exception.js";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import type { AuthService } from "../iam/auth.service.js";
import type { PlatformAuditEntry, PlatformAuditService } from "../platform/platform-audit.service.js";
import { currentTenantId } from "../tenancy/tenant-context.js";
import { DEMO_FEATURE_DEFAULTS } from "./demo.constants.js";
import { DemoProvisioningService } from "./demo-provisioning.service.js";
import type { DemoSignupSlot, DemoStore } from "./demo-store.service.js";

// M10 task 4.2 (`demo-sandbox-provisioning`, `demo-guardrails` rate limit + cap) — 429 past the
// IP/email limits and 503 at the cap with nothing created; otherwise one transaction under the new
// tenant: tenant → seed → guest super-admin → GOOGLE identity → features → audit → tokens.

const seed = vi.hoisted(() => ({ fail: false, calls: [] as string[] }));
vi.mock("@erp/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@erp/db")>();
  return {
    ...actual,
    seedDemoTenant: async (_tx: unknown, tenantId: string) => {
      seed.calls.push(tenantId);
      if (seed.fail) throw new Error("seed exploded");
      return { customers: 8, items: 10, workOrders: 5, employees: 12, invoices: 6 };
    },
  };
});

const GUEST = { sub: "google-sub-1", email: "guest@gmail.com", name: "Guest" };
const TOKENS = { access_token: "a", refresh_token: "r", expires_in: 900 };
const tableName = (t: unknown) => (is(t, PgTable) ? getTableConfig(t as PgTable).name : "?");

function setup(opts: { active?: number; ipCount?: number; emailCount?: number } = {}) {
  seed.fail = false;
  seed.calls = [];
  const inserts: { table: string; values: unknown; tenant: string | null }[] = [];
  const audits: PlatformAuditEntry[] = [];
  const released: DemoSignupSlot[] = [];
  let committed = false;

  const chain = (result: () => unknown) => {
    const q: Record<string, unknown> = {};
    for (const step of ["where", "limit"]) q[step] = () => q;
    q.returning = async () => result();
    q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve().then(result).then(ok, ko);
    return q;
  };
  const tx = {
    execute: async () => undefined,
    select: () => ({
      from: (t: unknown) =>
        chain(() => (tableName(t) === "plan" ? [{ id: "plan-factory" }] : [{ n: opts.active ?? 0 }])),
    }),
    insert: (t: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table: tableName(t), values, tenant: currentTenantId() });
        return chain(() => [{ id: "guest-user-id" }]);
      },
    }),
  };
  const uow = {
    withTransaction: async (fn: (t: unknown) => Promise<unknown>) => {
      const out = await fn(tx);
      committed = true;
      return out;
    },
  } as unknown as UnitOfWork;
  const auth = {
    signInWithIdentity: vi.fn(async () => TOKENS),
  };
  const passwords = { hash: async () => "unusable-hash" } as unknown as PasswordService;
  const audit = {
    append: async (e: PlatformAuditEntry) => {
      audits.push(e);
    },
  } as unknown as PlatformAuditService;
  const store = {
    takeSignupSlot: async () => ({
      ipKey: "demo:rl:ip:1.2.3.4",
      emailKey: "demo:rl:email:h",
      ipCount: opts.ipCount ?? 1,
      emailCount: opts.emailCount ?? 1,
    }),
    releaseSignupSlot: async (slot: DemoSignupSlot) => {
      released.push(slot);
    },
  } as unknown as DemoStore;
  const env: Record<string, number> = {
    DEMO_SIGNUP_RATE_PER_IP: 3,
    DEMO_SIGNUP_RATE_PER_EMAIL: 2,
    DEMO_MAX_CONCURRENT_SANDBOXES: 2,
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;

  const service = new DemoProvisioningService(
    tx as unknown as Db,
    uow,
    auth as unknown as AuthService,
    passwords,
    audit,
    store,
    config,
  );
  return { service, inserts, audits, released, auth, committed: () => committed };
}

describe("DemoProvisioningService.provision", () => {
  it("creates tenant → seed → guest → identity → features → audit in one tx, then signs in", async () => {
    const { service, inserts, audits, auth, released, committed } = setup();
    await expect(service.provision(GUEST, { ip: "1.2.3.4" })).resolves.toEqual(TOKENS);

    expect(inserts.map((i) => i.table)).toEqual(["tenant", "user", "auth_identity", "tenant_feature"]);
    const tenantRow = inserts[0]?.values as Record<string, unknown>;
    expect(tenantRow).toMatchObject({
      kind: "DEMO_SANDBOX",
      status: "ACTIVE",
      allowSelfSignup: true,
      planId: "plan-factory",
      demoGuestName: "Guest",
    });
    const tenantId = tenantRow.id as string;
    // Every write runs under the new sandbox's tenant scope (RLS admits the seed's rows).
    expect(inserts.every((i) => i.tenant === tenantId)).toBe(true);
    expect(seed.calls).toEqual([tenantId]);
    expect(inserts[1]?.values).toMatchObject({ isSuperAdmin: true, status: "ACTIVE", passwordHash: "unusable-hash" });
    expect(inserts[2]?.values).toMatchObject({ provider: "GOOGLE", subject: GUEST.sub, userId: "guest-user-id" });
    expect((inserts[3]?.values as { key: string }[]).map((f) => f.key).sort()).toEqual(
      Object.keys(DEMO_FEATURE_DEFAULTS).sort(),
    );
    // The provisioning audit row survives the purge, so it must not carry the guest's PII.
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(GUEST.email);
    expect(auth.signInWithIdentity).toHaveBeenCalledWith(tenantId, "GOOGLE", GUEST.sub);
    expect(committed()).toBe(true);
    expect(released).toEqual([]);
  });

  it("429s past the per-IP limit, creating nothing and giving the slot back", async () => {
    const { service, inserts, released } = setup({ ipCount: 4 });
    await expect(service.provision(GUEST, { ip: "1.2.3.4" })).rejects.toBeInstanceOf(RateLimitedError);
    expect(inserts).toEqual([]);
    expect(released).toHaveLength(1);
  });

  it("429s past the per-email limit", async () => {
    const { service, inserts } = setup({ emailCount: 3 });
    await expect(service.provision(GUEST, { ip: null })).rejects.toBeInstanceOf(RateLimitedError);
    expect(inserts).toEqual([]);
  });

  it("503s at the concurrent cap with nothing created", async () => {
    const { service, inserts, released } = setup({ active: 2 });
    await expect(service.provision(GUEST, { ip: "1.2.3.4" })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(inserts).toEqual([]);
    expect(released).toHaveLength(1);
  });

  it("issues no token when the seed fails (the transaction rolls back)", async () => {
    const { service, auth, committed, released } = setup();
    seed.fail = true;
    await expect(service.provision(GUEST, { ip: "1.2.3.4" })).rejects.toThrow("seed exploded");
    expect(auth.signInWithIdentity).not.toHaveBeenCalled();
    expect(committed()).toBe(false);
    expect(released).toHaveLength(1);
  });
});

describe("DemoProvisioningService.atCapacity", () => {
  it("is busy exactly at the cap", async () => {
    await expect(setup({ active: 1 }).service.atCapacity()).resolves.toBe(false);
    await expect(setup({ active: 2 }).service.atCapacity()).resolves.toBe(true);
  });
});
