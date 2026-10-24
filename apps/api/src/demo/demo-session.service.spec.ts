import { describe, expect, it, vi } from "vitest";
import type { Db } from "@erp/db";
import type { AuthUser } from "../auth/auth-user.js";
import { BusinessRuleError } from "../common/errors/app-exception.js";
import type { DemoGuardService } from "./demo-guard.service.js";
import type { DemoPurgeService } from "./demo-purge.service.js";
import { DemoSessionService } from "./demo-session.service.js";

// M10 task 4.6 — `POST /demo/end` and logout on a sandbox revoke every session and start the purge.

const TID = "00000000-0000-4000-8000-0000000000e1";
const guest: AuthUser = {
  id: "u1",
  sessionId: "s1",
  tenantId: TID,
  isSuperAdmin: true,
  permissions: new Set(),
};

function setup(kind: string | null) {
  const revoked: unknown[] = [];
  const db = {
    update: () => ({
      set: (v: unknown) => ({
        where: async () => {
          revoked.push(v);
        },
      }),
    }),
  } as unknown as Db;
  const guard = { kindOf: async () => kind } as unknown as DemoGuardService;
  const purge = { beginPurge: vi.fn(async () => true) };
  const service = new DemoSessionService(db, guard, purge as unknown as DemoPurgeService);
  return { service, revoked, purge };
}

describe("DemoSessionService", () => {
  it("ends a sandbox: revokes sessions, then marks it PURGING with a SIGN_OUT trigger", async () => {
    const { service, revoked, purge } = setup("DEMO_SANDBOX");
    await service.end(guest);
    expect(revoked).toHaveLength(1);
    expect(purge.beginPurge).toHaveBeenCalledWith(TID, "SIGN_OUT");
  });

  it("refuses POST /demo/end on a customer tenant (422) and touches nothing", async () => {
    const { service, revoked, purge } = setup("CUSTOMER");
    await expect(service.end(guest)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(revoked).toEqual([]);
    expect(purge.beginPurge).not.toHaveBeenCalled();
  });

  it("purges on a plain logout from a sandbox, but not from a customer tenant", async () => {
    const sandbox = setup("DEMO_SANDBOX");
    await sandbox.service.afterLogout(guest);
    expect(sandbox.purge.beginPurge).toHaveBeenCalledTimes(1);

    const customer = setup("CUSTOMER");
    await customer.service.afterLogout(guest);
    expect(customer.purge.beginPurge).not.toHaveBeenCalled();
  });

  it("never ends a sandbox when a platform support session signs out", async () => {
    const { service, purge } = setup("DEMO_SANDBOX");
    await service.afterLogout({ ...guest, supportSessionId: "sup-1" });
    expect(purge.beginPurge).not.toHaveBeenCalled();
  });
});
