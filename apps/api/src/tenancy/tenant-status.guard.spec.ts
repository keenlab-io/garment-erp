import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { TenantStatus } from "@erp/db";
import { ForbiddenError, TenantReadOnlyError } from "../common/errors/app-exception.js";
import { runWithTenant } from "./tenant-context.js";
import type { TenantResolutionService } from "./tenant-resolution.service.js";
import { TenantStatusGuard } from "./tenant-status.guard.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";

function guardWith(status: TenantStatus | null) {
  const lookups: string[] = [];
  const resolution = {
    statusOf: async (id: string) => {
      lookups.push(id);
      return status;
    },
  } as unknown as TenantResolutionService;
  return { guard: new TenantStatusGuard(resolution), lookups };
}

const http = (method: string) =>
  ({
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  }) as unknown as ExecutionContext;

const inTenant = <T>(fn: () => Promise<T>) => runWithTenant(TENANT, "jwt", fn);

describe("TenantStatusGuard", () => {
  it("passes (without a lookup) when no tenant is in scope", async () => {
    const { guard, lookups } = guardWith("SUSPENDED");
    await expect(guard.canActivate(http("POST"))).resolves.toBe(true);
    expect(lookups).toEqual([]);
  });

  it("ACTIVE allows reads and writes", async () => {
    const { guard, lookups } = guardWith("ACTIVE");
    await expect(inTenant(() => guard.canActivate(http("POST")))).resolves.toBe(true);
    expect(lookups).toEqual([TENANT]);
  });

  it("READ_ONLY allows reads but rejects mutations with TENANT_READ_ONLY", async () => {
    const { guard } = guardWith("READ_ONLY");
    await expect(inTenant(() => guard.canActivate(http("GET")))).resolves.toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const err = await inTenant(() => guard.canActivate(http(method))).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TenantReadOnlyError);
      expect((err as TenantReadOnlyError).code).toBe("TENANT_READ_ONLY");
    }
  });

  it.each(["SUSPENDED", "PURGING"] as const)("%s rejects every request, reads included", async (s) => {
    const { guard } = guardWith(s);
    await expect(inTenant(() => guard.canActivate(http("GET")))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inTenant(() => guard.canActivate(http("POST")))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("fails closed for a tenant id with no tenant row", async () => {
    const { guard } = guardWith(null);
    await expect(inTenant(() => guard.canActivate(http("GET")))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
