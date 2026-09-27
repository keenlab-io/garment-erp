import { describe, expect, it } from "vitest";
import { currentTenant, currentTenantId, isTenantId, runWithTenant } from "./tenant-context.js";

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
});
