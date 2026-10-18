import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Db, TenantStatus } from "@erp/db";
import { API_PREFIX, type TenantStatusUpdate } from "@erp/contracts";
import { TenantReadOnlyError } from "../../common/errors/app-exception.js";
import type { UnitOfWork } from "../../db/unit-of-work.service.js";
import { runWithTenant } from "../../tenancy/tenant-context.js";
import type { TenantResolutionService } from "../../tenancy/tenant-resolution.service.js";
import { TenantStatusGuard } from "../../tenancy/tenant-status.guard.js";
import type { PlatformAuditService } from "../platform-audit.service.js";
import type { TenantProvisioningService } from "../tenant-provisioning.service.js";
import { SubscriptionService, type SubscriptionRow } from "./subscription.service.js";

// M9 §7.2 — what a tenant's users actually experience as a subscription degrades: the real
// SubscriptionService drives a shared tenant status, which the real TenantStatusGuard enforces.

const TENANT = "33333333-3333-4333-8333-333333333333";
const SUB_ID = "22222222-2222-4222-8222-222222222222";

function row(status: SubscriptionRow["status"]): SubscriptionRow {
  return {
    id: SUB_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    tenantId: TENANT,
    planId: "44444444-4444-4444-8444-444444444444",
    annualFee: "150000.0000",
    termStart: new Date("2026-03-31T00:00:00Z"),
    termEnd: new Date("2027-03-31T00:00:00Z"),
    status,
    dunningEvents: [],
    cancelledAt: null,
    version: 0,
  } as SubscriptionRow;
}

function world(results: unknown[][]) {
  const state = { status: "ACTIVE" as TenantStatus };
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get(_t, prop) {
        if (prop === "then") {
          const next = results.shift() ?? [];
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(next).then(res, rej);
        }
        return () => chain();
      },
    });
  const db = { select: chain, update: chain, insert: chain, execute: async () => [] };
  const uow = { withTransaction: (fn: (tx: unknown) => unknown) => fn(db) } as unknown as UnitOfWork;
  const audit = { append: async () => undefined } as unknown as PlatformAuditService;
  const tenants = {
    setStatus: async (_id: string, update: TenantStatusUpdate) => {
      state.status = update.status as TenantStatus;
    },
    onTenantProvisioned: () => undefined,
  } as unknown as TenantProvisioningService;
  const subscriptions = new SubscriptionService(db as unknown as Db, uow, audit, tenants);
  const guard = new TenantStatusGuard({
    statusOf: async () => state.status,
  } as unknown as TenantResolutionService);
  const call = (method: string, path: string) =>
    runWithTenant(TENANT, "jwt", () =>
      guard.canActivate({
        getType: () => "http",
        switchToHttp: () => ({ getRequest: () => ({ method, path: `${API_PREFIX}${path}` }) }),
      } as unknown as ExecutionContext),
    );
  return { state, subscriptions, call };
}

describe("subscription degradation as the tenant's users see it", () => {
  it("IN_GRACE keeps the tenant fully writable", async () => {
    const { subscriptions, call } = world([[row("ACTIVE")], [row("IN_GRACE")]]);
    await subscriptions.transition(SUB_ID, "IN_GRACE", "term ended");
    await expect(call("POST", "/invoices")).resolves.toBe(true);
    await expect(call("GET", "/hr/payroll-runs")).resolves.toBe(true);
  });

  it("EXPIRED → READ_ONLY: payroll GET and PDPA export pass, business POST is TENANT_READ_ONLY", async () => {
    const { subscriptions, state, call } = world([
      [row("IN_GRACE")],
      [row("EXPIRED")],
      [{ status: "ACTIVE" }],
    ]);
    await subscriptions.transition(SUB_ID, "EXPIRED", "grace exhausted");
    expect(state.status).toBe("READ_ONLY");

    await expect(call("GET", "/hr/payroll-runs")).resolves.toBe(true);
    await expect(call("POST", "/iam/tenant-export")).resolves.toBe(true);
    const err = await call("POST", "/invoices").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TenantReadOnlyError);
    expect((err as TenantReadOnlyError).code).toBe("TENANT_READ_ONLY");
  });

  it("restoring the tenant to ACTIVE (what mark-paid does) re-opens writes", async () => {
    const { state, call } = world([]);
    state.status = "READ_ONLY";
    await expect(call("POST", "/invoices")).rejects.toBeInstanceOf(TenantReadOnlyError);
    state.status = "ACTIVE";
    await expect(call("POST", "/invoices")).resolves.toBe(true);
  });
});
