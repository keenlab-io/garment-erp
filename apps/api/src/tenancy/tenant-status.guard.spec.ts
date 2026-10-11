import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { TenantStatus } from "@erp/db";
import { API_PREFIX } from "@erp/contracts";
import { ForbiddenError, TenantReadOnlyError } from "../common/errors/app-exception.js";
import { enterTenant, openTenantSlot, runWithTenant } from "./tenant-context.js";
import type { TenantResolutionService } from "./tenant-resolution.service.js";
import { READ_ONLY_WRITE_ALLOWLIST, TenantStatusGuard } from "./tenant-status.guard.js";

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

const http = (method: string, path = `${API_PREFIX}/invoices`) =>
  ({
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
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

  it("READ_ONLY keeps payroll and report reads available (data stays viewable)", async () => {
    const { guard } = guardWith("READ_ONLY");
    for (const path of ["/hr/payslips", "/hr/payroll-runs", "/reports/sales-daily"]) {
      await expect(inTenant(() => guard.canActivate(http("GET", `${API_PREFIX}${path}`)))).resolves.toBe(true);
    }
    await expect(
      inTenant(() => guard.canActivate(http("POST", `${API_PREFIX}/hr/payroll-runs`))),
    ).rejects.toBeInstanceOf(TenantReadOnlyError);
  });

  it("a READ_ONLY-scope support session on an ACTIVE tenant is held to the READ_ONLY rules (M8 D8)", async () => {
    const { guard } = guardWith("ACTIVE");
    const asSupport = <T>(scope: "READ_ONLY" | "FULL", fn: () => Promise<T>) =>
      openTenantSlot(() => {
        enterTenant(TENANT, "jwt", {
          supportSessionId: "44444444-4444-4444-4444-444444444444",
          platformAdminId: "55555555-5555-5555-5555-555555555555",
          scope,
        });
        return fn();
      });
    await expect(asSupport("READ_ONLY", () => guard.canActivate(http("GET")))).resolves.toBe(true);
    await expect(
      asSupport("READ_ONLY", () => guard.canActivate(http("POST"))),
    ).rejects.toBeInstanceOf(TenantReadOnlyError);
    await expect(
      asSupport("READ_ONLY", () => guard.canActivate(http("POST", `${API_PREFIX}/auth/logout`))),
    ).resolves.toBe(true);
    await expect(asSupport("FULL", () => guard.canActivate(http("POST")))).resolves.toBe(true);
  });

  it("READ_ONLY allowlist is exactly login/refresh/logout, the PDPA export and the report export", () => {
    expect([...READ_ONLY_WRITE_ALLOWLIST].sort()).toEqual(
      [
        `POST ${API_PREFIX}/auth/login`,
        `POST ${API_PREFIX}/auth/logout`,
        `POST ${API_PREFIX}/auth/refresh`,
        `POST ${API_PREFIX}/iam/tenant-export`,
        `POST ${API_PREFIX}/reports/:report_key/export`,
      ].sort(),
    );
  });

  it("READ_ONLY lets the allowlisted writes through and still blocks look-alikes", async () => {
    const { guard } = guardWith("READ_ONLY");
    for (const path of [
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/iam/tenant-export",
      "/reports/sales-daily/export",
    ]) {
      await expect(inTenant(() => guard.canActivate(http("POST", `${API_PREFIX}${path}`)))).resolves.toBe(true);
    }
    await expect(
      inTenant(() => guard.canActivate(http("POST", `${API_PREFIX}/iam/tenant-export/`))),
    ).resolves.toBe(true);
    for (const [method, path] of [
      ["DELETE", "/auth/logout"],
      ["POST", "/auth/login/extra"],
      ["POST", "/reports/a/b/export"],
      ["POST", "/iam/tenant-export/123"],
      ["POST", "/users"],
    ] as const) {
      await expect(
        inTenant(() => guard.canActivate(http(method, `${API_PREFIX}${path}`))),
      ).rejects.toBeInstanceOf(TenantReadOnlyError);
    }
  });

  it("SUSPENDED refuses login with a contact-the-vendor message", async () => {
    const { guard } = guardWith("SUSPENDED");
    const err = await inTenant(() => guard.canActivate(http("POST", `${API_PREFIX}/auth/login`))).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).message).toMatch(/contact your vendor/);
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
