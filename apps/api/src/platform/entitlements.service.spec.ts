import { describe, expect, it, vi } from "vitest";
import {
  ENTITLED_MODULES,
  PERMISSIONS,
  entitledModules,
  moduleForPermission,
} from "@erp/contracts";
import type { Db } from "@erp/db";
import type { AuthUser } from "../auth/auth-user.js";
import { ForbiddenError } from "../common/errors/app-exception.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { EntitlementsService, resolveFeatures } from "./entitlements.service.js";

// M8 §5.1 — tenant_feature > plan.features > off; module gating beside assertPermissions.

const TENANT = "11111111-1111-4111-8111-111111111111";

const userOf = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: "u1",
  sessionId: "s1",
  tenantId: TENANT,
  isSuperAdmin: false,
  permissions: new Set(),
  ...overrides,
});

/**
 * A drizzle stand-in: every builder method chains, and each awaited query resolves to the next
 * queued result — enough to drive `resolve`'s two reads (tenant⋈plan, then tenant_feature).
 */
function fakeDb(results: unknown[][]) {
  let awaited = 0;
  const chain: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          const result = results[awaited++] ?? [];
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return () => chain;
      },
    },
  );
  return { db: { select: () => chain } as unknown as Db, queries: () => awaited };
}

describe("resolveFeatures", () => {
  it("lets a tenant override beat the plan default", () => {
    expect(resolveFeatures({ "module.hr": false }, [{ key: "module.hr", enabled: true }])).toEqual({
      "module.hr": true,
    });
    expect(resolveFeatures({ "module.hr": true }, [{ key: "module.hr", enabled: false }])).toEqual({
      "module.hr": false,
    });
  });

  it("leaves keys absent everywhere off (absent from the map)", () => {
    const resolved = resolveFeatures({ "module.sales": true }, []);
    expect(resolved["module.hr"]).toBeUndefined();
    expect(entitledModules(resolved)).toEqual(["sales"]);
  });

  it("ignores non-boolean plan values and non-object plan defaults", () => {
    expect(resolveFeatures({ "module.hr": "yes", "module.sales": 1 }, [])).toEqual({});
    expect(resolveFeatures(null, [])).toEqual({});
    expect(resolveFeatures(["module.hr"], [])).toEqual({});
  });
});

describe("moduleForPermission", () => {
  it("maps every catalog code to its gated module, and IAM to none", () => {
    for (const code of PERMISSIONS) {
      const module = moduleForPermission(code);
      if (code.startsWith("iam.")) expect(module).toBeNull();
      else expect(ENTITLED_MODULES).toContain(module);
    }
    expect(moduleForPermission("report.sales.view")).toBe("reporting");
    expect(moduleForPermission("hr.payroll.approve")).toBe("hr");
  });
});

describe("EntitlementsService", () => {
  it("resolves from the plan, applies overrides, and caches on the tenant context", async () => {
    const { db, queries } = fakeDb([
      [{ planId: "p1", features: { "module.hr": false, "module.sales": true } }],
      [{ key: "module.hr", enabled: true }],
    ]);
    const service = new EntitlementsService(db);

    await runWithTenant(TENANT, "jwt", async () => {
      const first = await service.resolve(TENANT);
      const second = await service.resolve(TENANT);
      expect(first).toEqual({ "module.hr": true, "module.sales": true });
      expect(second).toBe(first);
    });
    expect(queries()).toBe(2);
  });

  it("does not cache with `fresh`, nor for a tenant other than the one in scope", async () => {
    const plan = [{ planId: "p1", features: {} }];
    const { db, queries } = fakeDb([plan, [], plan, [], plan, []]);
    const service = new EntitlementsService(db);
    await runWithTenant(TENANT, "jwt", async () => {
      await service.resolve(TENANT, { fresh: true });
      await service.resolve(TENANT, { fresh: true });
      await service.resolve("22222222-2222-4222-8222-222222222222");
    });
    expect(queries()).toBe(6);
  });

  it("gives a plan-less (pre-catalog) tenant every module", async () => {
    const { db } = fakeDb([[{ planId: null, features: null }], []]);
    const resolved = await new EntitlementsService(db).resolve(TENANT);
    expect(entitledModules(resolved)).toEqual([...ENTITLED_MODULES]);
  });

  it("rejects an unentitled module with 403 naming the key — super-admins included", async () => {
    const service = new EntitlementsService({} as Db);
    vi.spyOn(service, "resolve").mockResolvedValue({ "module.sales": true });

    const err = await service
      .assertModuleEnabled(userOf({ isSuperAdmin: true }), "hr.employee.view")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).details).toEqual([
      { field: "module.hr", issue: "module not in plan" },
    ]);

    await expect(service.assertModuleEnabled(userOf(), "sales.invoice.create")).resolves.toBe(
      undefined,
    );
  });

  it("checks every module the codes span, and never gates IAM", async () => {
    const service = new EntitlementsService({} as Db);
    const resolve = vi.spyOn(service, "resolve").mockResolvedValue({ "module.reporting": true });

    await expect(
      service.assertModuleEnabled(userOf(), "report.cost.view", "inventory.cost.view"),
    ).rejects.toThrow(/inventory/);

    resolve.mockClear();
    await service.assertModuleEnabled(userOf(), "iam.user.manage");
    expect(resolve).not.toHaveBeenCalled();
  });
});
