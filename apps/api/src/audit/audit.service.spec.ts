import { auditLog, platformAuditLog, type Db } from "@erp/db";
import { describe, expect, it } from "vitest";
import { enterTenant, openTenantSlot, runWithTenant } from "../tenancy/tenant-context.js";
import { AuditService, SUPPORT_ACTOR_ROLE } from "./audit.service.js";

// M7 §6.3 / design D6-D7 — an audited action under a support session is written to BOTH the
// tenant's `audit_log` (tagged `platform_support`) and the control-plane `platform_audit_log`.

const TENANT = "00000000-0000-4000-8000-00000000000a";
const SUP = "44444444-4444-4444-4444-444444444444";
const ADMIN = "55555555-5555-5555-5555-555555555555";

function fakeDb() {
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  const db = {
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        inserts.push({ table, values });
      },
    }),
  } as unknown as Db;
  return { db, inserts };
}

describe("AuditService support-session dual-write", () => {
  it("writes only the tenant audit row for an ordinary user", async () => {
    const { db, inserts } = fakeDb();
    await runWithTenant(TENANT, "jwt", () =>
      new AuditService(db).record({ action: "UPDATE", entityType: "item" }),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe(auditLog);
    expect(inserts[0]?.values.actorRole).toBeNull();
    expect(inserts[0]?.values.tenantId).toBe(TENANT);
  });

  it("leaves tenant_id to the column default outside any tenant scope", async () => {
    const { db, inserts } = fakeDb();
    await new AuditService(db).record({ action: "UPDATE", entityType: "item" });
    expect(inserts[0]?.values).not.toHaveProperty("tenantId");
  });

  it("dual-writes into platform_audit_log under a support session", async () => {
    const { db, inserts } = fakeDb();
    await openTenantSlot(async () => {
      enterTenant(TENANT, "jwt", { supportSessionId: SUP, platformAdminId: ADMIN });
      await new AuditService(db).record({
        action: "VOID",
        entityType: "invoice",
        actorUserId: ADMIN,
        reason: "customer asked",
      });
    });
    expect(inserts.map((i) => i.table)).toEqual([auditLog, platformAuditLog]);
    expect(inserts[0]?.values).toMatchObject({
      actorRole: SUPPORT_ACTOR_ROLE,
      reason: "customer asked",
      tenantId: TENANT,
    });
    expect(inserts[1]?.values).toMatchObject({
      platformAdminId: ADMIN,
      tenantId: TENANT,
      action: "VOID",
      entityType: "invoice",
      actorRole: SUPPORT_ACTOR_ROLE,
    });
  });
});
