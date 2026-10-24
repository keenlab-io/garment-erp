import { describe, expect, it } from "vitest";
import type { Db } from "@erp/db";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { DEMO_GUARD_TTL_MS, DemoGuardService } from "./demo-guard.service.js";

// M10 task 4.1 — `isDemoSandbox()` reads the ambient tenant's kind, cached per tenant id.

const TID = "00000000-0000-4000-8000-0000000000f1";

/** A guard over a fake `tenant` read that answers `kind` (or no row) and counts the reads. */
function setup(kind: string | null) {
  let reads = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            reads += 1;
            return kind ? [{ kind }] : [];
          },
        }),
      }),
    }),
  } as unknown as Db;
  return { guard: new DemoGuardService(db), reads: () => reads };
}

describe("DemoGuardService", () => {
  it("is false outside any tenant scope, without a read", async () => {
    const { guard, reads } = setup("DEMO_SANDBOX");
    await expect(guard.isDemoSandbox()).resolves.toBe(false);
    expect(reads()).toBe(0);
  });

  it("answers for the tenant in scope", async () => {
    const sandbox = setup("DEMO_SANDBOX").guard;
    await expect(runWithTenant(TID, "jwt", () => sandbox.isDemoSandbox())).resolves.toBe(true);
    const customer = setup("CUSTOMER").guard;
    await expect(runWithTenant(TID, "job", () => customer.isDemoSandbox())).resolves.toBe(false);
  });

  it("caches the kind per tenant for the TTL, then re-reads", async () => {
    const { guard, reads } = setup("DEMO_SANDBOX");
    const t0 = 1_000_000;
    await guard.kindOf(TID, t0);
    await guard.kindOf(TID, t0 + DEMO_GUARD_TTL_MS - 1);
    expect(reads()).toBe(1);
    await guard.kindOf(TID, t0 + DEMO_GUARD_TTL_MS + 1);
    expect(reads()).toBe(2);
  });

  it("returns null for an unknown tenant", async () => {
    await expect(setup(null).guard.kindOf(TID)).resolves.toBeNull();
  });
});
