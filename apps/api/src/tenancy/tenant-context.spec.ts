import { describe, expect, it } from "vitest";
import {
  currentTenant,
  currentTenantId,
  enterTenant,
  isTenantId,
  openTenantSlot,
  runWithTenant,
} from "./tenant-context.js";

const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";

describe("tenant context (ALS)", () => {
  it("has no tenant outside any scope", () => {
    expect(currentTenantId()).toBeNull();
    expect(currentTenant()).toBeUndefined();
  });

  it("runWithTenant scopes the id + source across async hops", async () => {
    const seen = await runWithTenant(TENANT_A, "job", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentTenant();
    });
    expect(seen).toEqual({ tenantId: TENANT_A, source: "job" });
    expect(currentTenantId()).toBeNull();
  });

  it("nested scopes shadow and then restore the outer tenant", () => {
    runWithTenant(TENANT_A, "host", () => {
      runWithTenant(TENANT_B, "system", () => expect(currentTenantId()).toBe(TENANT_B));
      expect(currentTenantId()).toBe(TENANT_A);
    });
  });

  it("refuses to enter a malformed tenant id", () => {
    expect(() => runWithTenant("not-a-uuid'; DROP TABLE x;--", "jwt", () => 1)).toThrow(
      /not a uuid/,
    );
  });

  it("isTenantId accepts only uuids", () => {
    expect(isTenantId(TENANT_A)).toBe(true);
    expect(isTenantId(TENANT_A.toUpperCase())).toBe(true);
    expect(isTenantId("")).toBe(false);
    expect(isTenantId(42)).toBe(false);
    expect(isTenantId(null)).toBe(false);
  });

  it("enterTenant fills the open request slot so an awaited entry point's tenant reaches its caller", async () => {
    // Mirrors Nest awaiting JwtGuard.canActivate: the tenant is entered after an `await`
    // inside the callee, yet must be visible to the caller's continuation (interceptors,
    // handler) under either ALS implementation.
    const guard = async () => {
      await new Promise((r) => setTimeout(r, 1));
      enterTenant(TENANT_A, "jwt");
    };
    const seen = await openTenantSlot(async () => {
      expect(currentTenantId()).toBeNull();
      await guard();
      await new Promise((r) => setTimeout(r, 1));
      return currentTenant();
    });
    expect(seen).toEqual({ tenantId: TENANT_A, source: "jwt" });
    expect(currentTenantId()).toBeNull();
  });

  it("an explicit runWithTenant frame shadows the request slot", async () => {
    await openTenantSlot(async () => {
      enterTenant(TENANT_A, "jwt");
      runWithTenant(TENANT_B, "system", () => expect(currentTenantId()).toBe(TENANT_B));
      expect(currentTenantId()).toBe(TENANT_A);
    });
  });

  it("enterTenant refuses a malformed tenant id", () => {
    expect(() => openTenantSlot(() => enterTenant("nope", "jwt"))).toThrow(/not a uuid/);
  });
});
