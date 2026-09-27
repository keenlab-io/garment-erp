import { describe, expect, it } from "vitest";
import type { Response } from "express";
import { currentTenant } from "./tenant-context.js";
import { TenantResolutionMiddleware, type RequestWithHostTenant } from "./tenant-resolution.middleware.js";
import type { ResolvedTenant, TenantResolutionService } from "./tenant-resolution.service.js";
import { normalizeHost } from "./tenant-resolution.service.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";
const RESOLVED: ResolvedTenant = {
  tenantId: TENANT,
  name: "Factory A",
  slug: "factory-a",
  status: "ACTIVE",
  resolutionMode: "TENANT",
};

function run(resolved: ResolvedTenant | null, headers: Record<string, string> = {}) {
  const hosts: string[] = [];
  const resolution = {
    byHostname: async (host: string) => {
      hosts.push(host);
      return resolved;
    },
  } as unknown as TenantResolutionService;
  const middleware = new TenantResolutionMiddleware(resolution);
  const req = { hostname: "a.erp.example", headers } as unknown as RequestWithHostTenant;
  return new Promise<{ store: ReturnType<typeof currentTenant>; req: RequestWithHostTenant; hosts: string[] }>(
    (resolve, reject) => {
      void middleware.use(req, {} as Response, (err?: unknown) =>
        err ? reject(err) : resolve({ store: currentTenant(), req, hosts }),
      );
    },
  );
}

describe("TenantResolutionMiddleware", () => {
  it("enters tenantContext (source: host) for an unauthenticated request on a known host", async () => {
    const { store, req, hosts } = await run(RESOLVED);
    expect(hosts).toEqual(["a.erp.example"]);
    expect(store).toEqual({ tenantId: TENANT, source: "host" });
    expect(req.hostTenant).toEqual(RESOLVED);
  });

  it("never consults the host when the request carries a bearer token", async () => {
    const { store, hosts } = await run(RESOLVED, { authorization: "Bearer abc" });
    expect(hosts).toEqual([]);
    expect(store).toBeUndefined();
  });

  it("enters no context for an unknown host", async () => {
    const { store, req } = await run(null);
    expect(store).toBeUndefined();
    expect(req.hostTenant).toBeUndefined();
  });

  it("enters no context for a DEMO_POOL host (m10)", async () => {
    const { store } = await run({ ...RESOLVED, resolutionMode: "DEMO_POOL" });
    expect(store).toBeUndefined();
  });
});

describe("normalizeHost", () => {
  it("lower-cases and strips the port and trailing dot", () => {
    expect(normalizeHost("ERP.TheirFactory.co.th.")).toBe("erp.theirfactory.co.th");
    expect(normalizeHost("localhost:5173")).toBe("localhost");
  });
});
