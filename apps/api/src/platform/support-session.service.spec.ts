import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { Db } from "@erp/db";
import type { AuditEntry, AuditService } from "../audit/audit.service.js";
import type { TokenService } from "../auth/token.service.js";
import { BusinessRuleError, ValidationError } from "../common/errors/app-exception.js";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import { currentSupportScope, currentTenantId, type SupportScope } from "../tenancy/tenant-context.js";
import { SupportSessionService } from "./support-session.service.js";

// M8 §6.1/6.2 (design D8) — reason + scope + minutes ≤ cap; a no-refresh `sup` token whose TTL is
// the time box; opening the session is recorded under its own support scope (→ both ledgers).

const TENANT = "00000000-0000-4000-8000-00000000000a";
const SUP = "44444444-4444-4444-4444-444444444444";
const ADMIN = "55555555-5555-5555-5555-555555555555";

function setup(tenantStatus: string | null = "ACTIVE") {
  const inserted: Record<string, unknown>[] = [];
  const signed: { claims: Record<string, unknown>; opts: { expiresIn?: number } }[] = [];
  const recorded: { entry: AuditEntry; tenantId: string | null; support?: SupportScope }[] = [];

  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (tenantStatus ? [{ status: tenantStatus }] : []) }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return {
          returning: async () => [{ ...values, id: SUP, revokedAt: null, createdAt: new Date() }],
        };
      },
    }),
  };
  const uow = { withTransaction: (fn: (t: unknown) => unknown) => fn(tx) } as unknown as UnitOfWork;
  const tokens = {
    signAccess: async (claims: Record<string, unknown>, opts: { expiresIn?: number }) => {
      signed.push({ claims, opts });
      return "sup-token";
    },
  } as unknown as TokenService;
  const ledger = {
    record: async (entry: AuditEntry) => {
      recorded.push({ entry, tenantId: currentTenantId(), support: currentSupportScope() });
    },
  } as unknown as AuditService;
  const env: Record<string, number> = {
    SUPPORT_SESSION_DEFAULT_MINUTES: 60,
    SUPPORT_SESSION_MAX_MINUTES: 120,
  };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;

  const service = new SupportSessionService({} as Db, uow, tokens, ledger, config);
  return { service, inserted, signed, recorded };
}

describe("SupportSessionService.create", () => {
  it("rejects a blank reason with VALIDATION_ERROR before touching the database", async () => {
    const { service, inserted } = setup();
    await expect(
      service.create({ tenant_id: TENANT, reason: "   ", scope: "FULL" }, ADMIN),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(inserted).toEqual([]);
  });

  it("rejects minutes above SUPPORT_SESSION_MAX_MINUTES", async () => {
    const { service, inserted } = setup();
    await expect(
      service.create({ tenant_id: TENANT, reason: "ticket", scope: "FULL", minutes: 121 }, ADMIN),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(inserted).toEqual([]);
  });

  it("defaults the time box and mints a sup token whose TTL is exactly that box", async () => {
    const { service, inserted, signed } = setup();
    const before = Date.now();
    const out = await service.create(
      { tenant_id: TENANT, reason: " ticket #42 ", scope: "READ_ONLY" },
      ADMIN,
    );
    expect(inserted[0]).toMatchObject({ tenantId: TENANT, reason: "ticket #42", scope: "READ_ONLY" });
    const expiresAt = (inserted[0]?.expiresAt as Date).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(60 * 60_000);
    expect(expiresAt - before).toBeLessThan(60 * 60_000 + 5_000);
    expect(signed[0]?.claims).toMatchObject({ sub: ADMIN, tid: TENANT, sup: SUP });
    expect(signed[0]?.opts.expiresIn).toBe(60 * 60);
    expect(out).toEqual({
      access_token: "sup-token",
      support_session: expect.objectContaining({ id: SUP, scope: "READ_ONLY", revoked_at: null }),
    });
    // There is no refresh token to hand out — expiry IS the time box.
    expect(out).not.toHaveProperty("refresh_token");
  });

  it("records the opening under the session's own support scope so it lands in both ledgers", async () => {
    const { service, recorded } = setup();
    await service.create({ tenant_id: TENANT, reason: "ticket", scope: "FULL", minutes: 15 }, ADMIN);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      tenantId: TENANT,
      support: { supportSessionId: SUP, platformAdminId: ADMIN, scope: "FULL" },
      entry: { action: "CREATE", entityType: "support_session", entityId: SUP, reason: "ticket" },
    });
  });

  it("refuses a suspended tenant", async () => {
    const { service, signed } = setup("SUSPENDED");
    await expect(
      service.create({ tenant_id: TENANT, reason: "ticket", scope: "FULL" }, ADMIN),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(signed).toEqual([]);
  });
});
