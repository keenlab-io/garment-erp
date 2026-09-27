import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_TENANT_ID, createDb, session, tenant, user } from "@erp/db";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { assertPermissions } from "../../src/auth/authz.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { TokenService } from "../../src/auth/token.service.js";
import { NotFoundError, UnauthenticatedError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { AuditService } from "../../src/audit/audit.service.js";
import { AuditSubscriber } from "../../src/audit/audit.subscriber.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import { AuthService } from "../../src/iam/auth.service.js";
import { RolePermissionResolver } from "../../src/iam/role-permission.resolver.js";
import { UserService } from "../../src/iam/user.service.js";
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST. M7 §5 — tenant-scoped authentication: `tid` in both tokens,
// `(tenant_id, username)` credential lookup against the host-resolved tenant, per-tenant
// lockout, refresh pinned to the token's tenant, the `me` tenant block, and the regression
// that a tenant super-admin reads zero rows of another tenant. Tenant A is the default tenant
// (migration 0012); tenant B is created here. Usernames are suffixed per run because the IAM
// spec wipes the `user` table between its own tests.
describe.skipIf(!url)("tenant-scoped auth (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let passwords: PasswordService;
  let tokens: TokenService;
  let uow: UnitOfWork;
  let authService: AuthService;
  let userService: UserService;

  const TENANT_A = DEFAULT_TENANT_ID;
  const TENANT_B = randomUUID();
  const run = randomUUID().slice(0, 8);
  const name = (base: string) => `${base}-${run}`;

  const config = {
    getOrThrow: (key: string) =>
      ({
        JWT_ACCESS_SECRET: "test-access-secret",
        JWT_REFRESH_SECRET: "test-refresh-secret",
        JWT_ACCESS_TTL: "15m",
        JWT_REFRESH_TTL: "7d",
      })[key],
  } as unknown as ConfigService;

  async function createUser(
    tenantId: string,
    username: string,
    password: string,
    isSuperAdmin = false,
  ): Promise<string> {
    const [row] = await conn.db
      .insert(user)
      .values({
        tenantId,
        username,
        email: `${username}@test.local`,
        passwordHash: await passwords.hash(password),
        status: "ACTIVE",
        isSuperAdmin,
        permissionsVersion: 1,
      })
      .returning({ id: user.id });
    return (row as { id: string }).id;
  }

  /** Log in as if the request arrived on `tenantId`'s hostname (the middleware's scope). */
  const loginOn = (tenantId: string, username: string, password: string) =>
    runWithTenant(tenantId, "host", () => authService.login(username, password));

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    passwords = new PasswordService();
    tokens = new TokenService(new JwtService({}), config);
    uow = new UnitOfWork(conn.db);
    const emitter = new EventEmitter2({ wildcard: true, delimiter: "." });
    const auditSubscriber = new AuditSubscriber(new AuditService(conn.db));
    emitter.on("**", (event) => auditSubscriber.handle(event));
    const events = new EventBusService(emitter);
    authService = new AuthService(
      conn.db,
      passwords,
      tokens,
      config,
      uow,
      events,
      new RolePermissionResolver(conn.db),
    );
    userService = new UserService(conn.db, passwords, uow, events);

    await conn.db
      .insert(tenant)
      .values({ id: TENANT_B, slug: `tenant-b-${run}`, name: "Factory B", kind: "CUSTOMER" });
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("the same username logs into each tenant's own account; tokens and session carry the tenant", async () => {
    const somchai = name("somchai");
    const idA = await createUser(TENANT_A, somchai, "pw-a");
    const idB = await createUser(TENANT_B, somchai, "pw-b");

    const pairA = await loginOn(TENANT_A, somchai, "pw-a");
    const pairB = await loginOn(TENANT_B, somchai, "pw-b");

    const accessA = await tokens.verifyAccess(pairA.access_token);
    const accessB = await tokens.verifyAccess(pairB.access_token);
    expect(accessA).toMatchObject({ sub: idA, tid: TENANT_A });
    expect(accessB).toMatchObject({ sub: idB, tid: TENANT_B });
    expect(accessB.sup).toBeUndefined();
    expect(await tokens.verifyRefresh(pairB.refresh_token)).toMatchObject({
      sub: idB,
      tid: TENANT_B,
    });

    const [sessB] = await conn.db
      .select({ tenantId: session.tenantId })
      .from(session)
      .where(eq(session.tokenId, accessB.sid));
    expect(sessB?.tenantId).toBe(TENANT_B);

    // Tenant A's credentials on tenant B's host: the lookup is (B, somchai) → B's password.
    await expect(loginOn(TENANT_B, somchai, "pw-a")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("a user of tenant A is unknown on tenant B's host", async () => {
    const onlyA = name("only-a");
    await createUser(TENANT_A, onlyA, "pw");
    await expect(loginOn(TENANT_B, onlyA, "pw")).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(loginOn(TENANT_A, onlyA, "pw")).resolves.toHaveProperty("access_token");
  });

  it("lockout does not cross tenants", async () => {
    const victim = name("victim");
    await createUser(TENANT_A, victim, "pw-a");
    await createUser(TENANT_B, victim, "pw-b");

    for (let i = 0; i < 5; i++) {
      await expect(loginOn(TENANT_A, victim, "wrong")).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    }
    await expect(loginOn(TENANT_A, victim, "pw-a")).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(loginOn(TENANT_B, victim, "pw-b")).resolves.toHaveProperty("access_token");

    const rows = await conn.db
      .select({ tenantId: user.tenantId, failed: user.failedLoginCount })
      .from(user)
      .where(eq(user.username, victim));
    const byTenant = Object.fromEntries(rows.map((r) => [r.tenantId, r.failed]));
    expect(byTenant[TENANT_A]).toBe(5);
    expect(byTenant[TENANT_B]).toBe(0);
  });

  it("refresh keeps the token's tenant, whatever host it arrives on", async () => {
    const mover = name("mover");
    await createUser(TENANT_B, mover, "pw");
    const pair = await loginOn(TENANT_B, mover, "pw");

    const refreshed = await runWithTenant(TENANT_A, "host", () =>
      authService.refresh(pair.refresh_token),
    );
    expect((await tokens.verifyAccess(refreshed.access_token)).tid).toBe(TENANT_B);
  });

  it("GET /auth/me returns the caller's tenant block", async () => {
    const who = name("who");
    const id = await createUser(TENANT_B, who, "pw");
    const me = await runWithTenant(TENANT_B, "jwt", () =>
      uow.withTransaction(() =>
        authService.me({
          id,
          sessionId: randomUUID(),
          tenantId: TENANT_B,
          isSuperAdmin: false,
          permissions: new Set(),
        }),
      ),
    );
    expect(me.tenant).toEqual({ id: TENANT_B, name: "Factory B", slug: `tenant-b-${run}` });
  });

  // Task 5.5 — `isSuperAdmin` is a tenant super-admin: the permission bypass never reaches
  // another tenant's rows. The fence is Row-Level Security under the request's tenant
  // transaction — migration 0013's `tenant_isolation` policy on `user` — so the service runs as
  // the non-owner, NOBYPASSRLS runtime role `erp_app` (the test connection is a superuser,
  // which RLS skips).
  describe("tenant super-admin is fenced to its own tenant", () => {
    /** Run `fn` as tenant `tenantId`'s request would: tenant tx, runtime role. */
    const asTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
      runWithTenant(tenantId, "jwt", () =>
        uow.withTransaction(async (tx) => {
          await tx.execute(sql`SET LOCAL ROLE erp_app`);
          return fn();
        }),
      );

    it("a super-admin of tenant A lists zero tenant-B users and cannot fetch one by id", async () => {
      const adminId = await createUser(TENANT_A, name("root-a"), "pw", true);
      const bUser = await createUser(TENANT_B, name("b-staff"), "pw");
      const superAdminA: AuthUser = {
        id: adminId,
        sessionId: randomUUID(),
        tenantId: TENANT_A,
        isSuperAdmin: true,
        permissions: new Set(),
      };
      // The permission bypass holds (no codes resolved, yet authorized)…
      expect(() => assertPermissions(superAdminA, "iam.user.manage")).not.toThrow();

      // …but it grants nothing outside tenant A's rows.
      const page = await asTenant(TENANT_A, () => userService.list(200, undefined, undefined));
      const tenants = await conn.db
        .select({ id: user.id, tenantId: user.tenantId })
        .from(user);
      const tenantOf = new Map(tenants.map((r) => [r.id, r.tenantId]));
      expect(page.data.map((u) => u.id)).toContain(adminId);
      expect(page.data.filter((u) => tenantOf.get(u.id) === TENANT_B)).toEqual([]);

      await expect(asTenant(TENANT_A, () => userService.get(bUser))).rejects.toBeInstanceOf(
        NotFoundError,
      );

      // Sanity: the row exists and is visible to its own tenant.
      const own = await asTenant(TENANT_B, () => userService.get(bUser));
      expect(own.id).toBe(bUser);
    });
  });
});
