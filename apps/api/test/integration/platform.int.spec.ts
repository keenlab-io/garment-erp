import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  advancePolicy,
  auditLog,
  createDb,
  documentSequence,
  documentTemplate,
  otRate,
  platformAdmin,
  platformAuditLog,
  ssoConfig,
  supportSession,
  taxBracket,
  tenant,
  tenantDomain,
  uom,
  warehouse,
} from "@erp/db";
import { AuditService, SUPPORT_ACTOR_ROLE } from "../../src/audit/audit.service.js";
import type { AuthUser } from "../../src/auth/auth-user.js";
import {
  DefaultPermissionResolver,
  DefaultSessionLookup,
  DefaultSupportSessionLookup,
  DefaultUserLookup,
} from "../../src/auth/auth.defaults.js";
import { JwtGuard } from "../../src/auth/jwt.guard.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { TokenService } from "../../src/auth/token.service.js";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
  UnauthenticatedError,
} from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { PlatformAuditService } from "../../src/platform/platform-audit.service.js";
import { PlatformAuthService } from "../../src/platform/platform-auth.service.js";
import { SupportSessionService } from "../../src/platform/support-session.service.js";
import { TenantProvisioningService } from "../../src/platform/tenant-provisioning.service.js";
import { openTenantSlot } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST. M7 §6 — the platform control plane: platform-admin login +
// lockout, the audience split between platform and tenant tokens, transactional provisioning
// (tenant + domain + seeded defaults + platform audit row), tenant status changes, support
// sessions (tid+sup token admitted by JwtGuard until revoked), the support dual-write into both
// audit logs, and the platform audit read. Slugs/emails are suffixed per run.
describe.skipIf(!url)("platform module (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let passwords: PasswordService;
  let tokens: TokenService;
  let uow: UnitOfWork;
  let platformAudit: PlatformAuditService;
  let platformAuth: PlatformAuthService;
  let provisioning: TenantProvisioningService;
  let support: SupportSessionService;
  let jwtGuard: JwtGuard;

  const run = randomUUID().slice(0, 8);
  const email = `ops-${run}@platform.local`;
  let adminId: string;

  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    JWT_PLATFORM_SECRET: "test-platform-secret",
    JWT_PLATFORM_TTL: "30m",
  };
  const config = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;

  const bearer = (token: string) => {
    const request: { headers: { authorization: string }; user?: AuthUser } = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  };

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    passwords = new PasswordService();
    tokens = new TokenService(new JwtService({}), config);
    uow = new UnitOfWork(conn.db);
    platformAudit = new PlatformAuditService(conn.db);
    platformAuth = new PlatformAuthService(
      conn.db,
      new JwtService({}),
      config,
      passwords,
      uow,
      platformAudit,
    );
    provisioning = new TenantProvisioningService(conn.db, uow, platformAudit);
    support = new SupportSessionService(conn.db, uow, tokens, platformAudit);
    jwtGuard = new JwtGuard(
      { getAllAndOverride: () => false } as unknown as Reflector,
      tokens,
      new DefaultUserLookup(conn.db),
      new DefaultSessionLookup(conn.db),
      new DefaultPermissionResolver(),
      uow,
      new DefaultSupportSessionLookup(conn.db),
    );

    const [row] = await conn.db
      .insert(platformAdmin)
      .values({ email, passwordHash: await passwords.hash("platform-pw") })
      .returning({ id: platformAdmin.id });
    adminId = (row as { id: string }).id;
  });

  afterAll(async () => {
    // Remove the seeded defaults of every tenant provisioned here (all slugs end `-${run}`).
    // Until the RLS migration (task 7.9) some services read config tables like `tax_bracket`
    // unscoped, so another spec sharing this database would otherwise see these tenants' rows.
    // The tenant rows stay: support sessions and platform audit rows reference them.
    if (conn) {
      const ids = (
        await conn.db.select({ id: tenant.id }).from(tenant).where(like(tenant.slug, `%-${run}`))
      ).map((t) => t.id);
      if (ids.length > 0) {
        for (const table of [
          documentSequence,
          uom,
          warehouse,
          taxBracket,
          ssoConfig,
          otRate,
          advancePolicy,
          documentTemplate,
        ]) {
          await conn.db.delete(table).where(inArray(table.tenantId, ids));
        }
      }
    }
    await conn?.queryClient.end();
  });

  it("logs a platform admin in with a platform-audience token the tenant guard refuses", async () => {
    const pair = await platformAuth.login(email, "platform-pw");
    expect(pair.expires_in).toBe(1800);

    await expect(platformAuth.authenticate(pair.access_token)).resolves.toEqual({
      id: adminId,
      email,
    });
    // Neither the tenant verifier nor the JwtGuard accepts a platform token.
    await expect(tokens.verifyAccess(pair.access_token)).rejects.toThrow();
    await expect(
      openTenantSlot(() => jwtGuard.canActivate(bearer(pair.access_token).ctx)),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    // The refresh token is not an access token for the platform guard either.
    await expect(platformAuth.authenticate(pair.refresh_token)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );

    const logins = await conn.db
      .select()
      .from(platformAuditLog)
      .where(and(eq(platformAuditLog.platformAdminId, adminId), eq(platformAuditLog.action, "LOGIN")));
    expect(logins.length).toBeGreaterThanOrEqual(1);
  });

  it("refuses a tenant access token at the platform guard", async () => {
    const tenantToken = await tokens.signAccess({
      sub: adminId,
      sid: randomUUID(),
      pv: 1,
      tid: randomUUID(),
    });
    await expect(platformAuth.authenticate(tenantToken)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("locks a platform admin after repeated bad passwords, like the tenant policy", async () => {
    const lockEmail = `locked-${run}@platform.local`;
    await conn.db
      .insert(platformAdmin)
      .values({ email: lockEmail, passwordHash: await passwords.hash("right") });

    for (let i = 0; i < 5; i++) {
      await expect(platformAuth.login(lockEmail, "wrong")).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    }
    await expect(platformAuth.login(lockEmail, "right")).rejects.toThrow(/locked/);
    await expect(platformAuth.login(`nobody-${run}@platform.local`, "x")).rejects.toThrow(
      /Invalid credentials/,
    );
  });

  it("provisions a tenant, its domain, and its seeded defaults atomically with an audit row", async () => {
    const slug = `acme-${run}`;
    const created = await provisioning.provision(
      { name: "Acme Garments", slug, domain: `Acme-${run}.erp.example:443` },
      adminId,
    );
    expect(created).toMatchObject({ name: "Acme Garments", slug, kind: "CUSTOMER", status: "ACTIVE" });

    const [domain] = await conn.db
      .select()
      .from(tenantDomain)
      .where(eq(tenantDomain.tenantId, created.id));
    expect(domain?.hostname).toBe(`acme-${run}.erp.example`);

    const seqs = await conn.db
      .select()
      .from(documentSequence)
      .where(eq(documentSequence.tenantId, created.id));
    expect(seqs.length).toBeGreaterThan(0);
    const uoms = await conn.db.select().from(uom).where(eq(uom.tenantId, created.id));
    expect(uoms.length).toBeGreaterThan(0);

    const [auditRow] = await conn.db
      .select()
      .from(platformAuditLog)
      .where(and(eq(platformAuditLog.entityId, created.id), eq(platformAuditLog.action, "CREATE")));
    expect(auditRow).toMatchObject({ platformAdminId: adminId, tenantId: created.id, entityType: "tenant" });

    // A duplicate slug is rejected by the citext unique — and leaves no partial tenant behind.
    await expect(
      provisioning.provision({ name: "Dup", slug: slug.toUpperCase(), domain: `dup-${run}.erp.example` }),
    ).rejects.toThrow();
    const dupDomain = await conn.db
      .select()
      .from(tenantDomain)
      .where(eq(tenantDomain.hostname, `dup-${run}.erp.example`));
    expect(dupDomain).toEqual([]);

    await expect(provisioning.provision({ name: "Bad", slug: "not a slug" })).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("ensureTenant is idempotent", async () => {
    const slug = `selfhosted-${run}`;
    const first = await provisioning.ensureTenant(slug);
    const second = await provisioning.ensureTenant(slug);
    expect(second.id).toBe(first.id);
    const rows = await conn.db.select().from(tenant).where(eq(tenant.slug, slug));
    expect(rows).toHaveLength(1);
  });

  it("changes a tenant's status with a platform audit row and lists by status", async () => {
    const created = await provisioning.provision({ name: "Status Co", slug: `status-${run}` }, adminId);
    const updated = await provisioning.setStatus(
      created.id,
      { status: "READ_ONLY", reason: "billing overdue" },
      adminId,
    );
    expect(updated.status).toBe("READ_ONLY");

    const page = await provisioning.list({ limit: 100, status: "READ_ONLY" });
    expect(page.data.map((t) => t.id)).toContain(created.id);
    expect(page.data.every((t) => t.status === "READ_ONLY")).toBe(true);

    const audit = await platformAudit.list({ limit: 10, entity_id: created.id });
    expect(audit.data[0]).toMatchObject({
      action: "UPDATE",
      reason: "billing overdue",
      before: { status: "ACTIVE" },
      after: { status: "READ_ONLY" },
    });

    await expect(
      provisioning.setStatus(randomUUID(), { status: "ACTIVE", reason: "x" }, adminId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("opens a support session whose tid+sup token authenticates until revoked, dual-writing audits", async () => {
    const target = await provisioning.provision({ name: "Support Co", slug: `support-${run}` }, adminId);

    const opened = await support.create(
      { tenant_id: target.id, reason: "ticket #42", minutes: 30 },
      adminId,
    );
    const claims = await tokens.verifyAccess(opened.access_token);
    expect(claims).toMatchObject({ sub: adminId, tid: target.id, sup: opened.support_session.id });
    expect(opened.support_session).toMatchObject({ tenant_id: target.id, reason: "ticket #42", revoked_at: null });

    // The tenant guard admits it as a tenant super-admin carrying the support session.
    const { ctx, request } = bearer(opened.access_token);
    const audit = new AuditService(conn.db);
    await openTenantSlot(async () => {
      await jwtGuard.canActivate(ctx);
      // An audited action under the support session lands in BOTH audit logs.
      await uow.withTransaction(() =>
        audit.record({
          action: "UPDATE",
          entityType: "item",
          entityId: target.id,
          actorUserId: adminId,
          reason: `support-${run}`,
        }),
      );
    });
    expect(request.user).toMatchObject({
      id: adminId,
      tenantId: target.id,
      supportSessionId: opened.support_session.id,
      isSuperAdmin: true,
    });

    const [tenantRow] = await conn.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.reason, `support-${run}`));
    expect(tenantRow).toMatchObject({ tenantId: target.id, actorRole: SUPPORT_ACTOR_ROLE });
    const [platformRow] = await conn.db
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.reason, `support-${run}`));
    expect(platformRow).toMatchObject({ tenantId: target.id, platformAdminId: adminId });

    // Revocation kills the token on the next request; a second revoke is a conflict.
    await support.revoke(opened.support_session.id, adminId);
    const [row] = await conn.db
      .select()
      .from(supportSession)
      .where(eq(supportSession.id, opened.support_session.id));
    expect(row?.revokedAt).not.toBeNull();
    await expect(
      openTenantSlot(() => jwtGuard.canActivate(bearer(opened.access_token).ctx)),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(support.revoke(opened.support_session.id, adminId)).rejects.toBeInstanceOf(
      StateConflictError,
    );

    const trail = await platformAudit.list({ limit: 10, entity_id: opened.support_session.id });
    expect(trail.data.map((r) => r.action).sort()).toEqual(["CREATE", "UPDATE"]);
  });

  it("refuses support sessions against unknown or suspended tenants", async () => {
    await expect(
      support.create({ tenant_id: randomUUID(), reason: "x", minutes: 5 }, adminId),
    ).rejects.toBeInstanceOf(NotFoundError);

    const suspended = await provisioning.provision({ name: "Gone", slug: `gone-${run}` }, adminId);
    await provisioning.setStatus(suspended.id, { status: "SUSPENDED", reason: "churned" }, adminId);
    await expect(
      support.create({ tenant_id: suspended.id, reason: "x", minutes: 5 }, adminId),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("paginates the platform audit log newest-first with a cursor", async () => {
    const first = await platformAudit.list({ limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = await platformAudit.list({ limit: 2, cursor: first.next_cursor as string });
    const firstIds = new Set(first.data.map((r) => r.id));
    expect(second.data.some((r) => firstIds.has(r.id))).toBe(false);
    const last = first.data[1] as { at: string };
    expect(second.data.every((r) => r.at <= last.at)).toBe(true);
  });

  it("paginates tenants with a cursor without skipping or repeating rows", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await provisioning.list({ limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...page.data.map((t) => t.id));
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    const all = await conn.db.select({ id: tenant.id }).from(tenant);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual(all.map((t) => t.id).sort());
  });
});
