import { count, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  createDb,
  permission,
  PERMISSION_CODES,
  role,
  rolePermission,
  roleTemplate,
  session,
  user,
  userRole,
} from "@erp/db";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { TokenService } from "../../src/auth/token.service.js";
import {
  ForbiddenError,
  StateConflictError,
  UnauthenticatedError,
  ValidationError,
} from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { AuditService } from "../../src/audit/audit.service.js";
import { AuditSubscriber } from "../../src/audit/audit.subscriber.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import { AuthService } from "../../src/iam/auth.service.js";
import { ImportService } from "../../src/iam/import.service.js";
import { RolePermissionResolver } from "../../src/iam/role-permission.resolver.js";
import { RoleService } from "../../src/iam/role.service.js";
import { UserService } from "../../src/iam/user.service.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST (the Testcontainers globalSetup). Exercises the M1 IAM
// services end-to-end against a real Postgres, covering the spec §1.8 acceptance
// criteria (tasks 4.1–4.7). The audit subscriber is wired to the event bus by hand so
// `publishInTransaction` writes audit rows inside the same transaction.
describe.skipIf(!url)("IAM services (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let passwords: PasswordService;
  let uow: UnitOfWork;
  let events: EventBusService;
  let resolver: RolePermissionResolver;
  let authService: AuthService;
  let roleService: RoleService;
  let userService: UserService;
  let importService: ImportService;

  const ADMIN_PASSWORD = "admin-password";
  let admin: AuthUser;

  const config = {
    getOrThrow: (key: string) =>
      ({
        JWT_ACCESS_SECRET: "test-access-secret",
        JWT_REFRESH_SECRET: "test-refresh-secret",
        JWT_ACCESS_TTL: "15m",
        JWT_REFRESH_TTL: "7d",
      })[key],
  } as unknown as ConfigService;

  async function createUser(opts: {
    username: string;
    password: string;
    status?: "PENDING" | "ACTIVE" | "DISABLED";
    isSuperAdmin?: boolean;
  }): Promise<string> {
    const passwordHash = await passwords.hash(opts.password);
    const [row] = await conn.db
      .insert(user)
      .values({
        username: opts.username,
        email: `${opts.username}@test.local`,
        passwordHash,
        status: opts.status ?? "ACTIVE",
        isSuperAdmin: opts.isSuperAdmin ?? false,
        permissionsVersion: 1,
      })
      .returning({ id: user.id });
    return (row as { id: string }).id;
  }

  async function version(userId: string): Promise<number> {
    const [row] = await conn.db
      .select({ v: user.permissionsVersion })
      .from(user)
      .where(eq(user.id, userId));
    return (row as { v: number }).v;
  }

  function xlsx(rows: string[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Roles");
    for (const r of rows) ws.addRow(r);
    return wb.xlsx.writeBuffer().then((b) => Buffer.from(b as ArrayBuffer));
  }

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    passwords = new PasswordService();
    uow = new UnitOfWork(conn.db);
    resolver = new RolePermissionResolver(conn.db);

    // Wire the audit subscriber to the bus by hand (no Nest DI in this harness).
    const emitter = new EventEmitter2({ wildcard: true, delimiter: "." });
    const auditSubscriber = new AuditSubscriber(new AuditService(conn.db));
    emitter.on("**", (event) => auditSubscriber.handle(event));
    events = new EventBusService(emitter);

    const tokens = new TokenService(new JwtService({}), config);
    authService = new AuthService(
      conn.db,
      passwords,
      tokens,
      config,
      uow,
      events,
      resolver,
    );
    roleService = new RoleService(conn.db, passwords, uow, events);
    userService = new UserService(conn.db, passwords, uow, events);
    importService = new ImportService(conn.db, uow, events);

    // The permission catalog is seeded by seed.ts, not by migrations — seed it here.
    await conn.db
      .insert(permission)
      .values(PERMISSION_CODES.map((code) => ({ code })))
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  beforeEach(async () => {
    // Clear all IAM rows (children first); keep the seeded permission catalog.
    // `audit_log` is append-only (DB trigger) so it is never cleared — the audit
    // assertions below scope to a fresh entity id or a before/after count delta.
    await conn.db.delete(session);
    await conn.db.delete(userRole);
    await conn.db.delete(rolePermission);
    await conn.db.delete(roleTemplate);
    await conn.db.delete(role);
    await conn.db.delete(user);

    const adminId = await createUser({
      username: "superadmin",
      password: ADMIN_PASSWORD,
      isSuperAdmin: true,
    });
    admin = {
      id: adminId,
      sessionId: "admin-session",
      isSuperAdmin: true,
      permissions: new Set(),
    };
  });

  // 4.7
  it("resolves the role→permission union; no roles ⇒ empty set", async () => {
    const codes = ["iam.audit.view", "iam.user.manage"] as const;
    const created = await roleService.create(
      { name: "Auditors", permission_codes: [...codes] },
      admin,
    );
    const uid = await createUser({ username: "u1", password: "pw" });
    await userService.setRoles(uid, { role_ids: [created.id] }, admin);

    const resolved = await resolver.resolve(uid);
    expect([...resolved].sort()).toEqual([...codes].sort());

    const none = await createUser({ username: "u2", password: "pw" });
    expect((await resolver.resolve(none)).size).toBe(0);
  });

  // 4.1
  it("bumps a bound user's permissions_version when the role changes", async () => {
    const created = await roleService.create(
      { name: "Editors", permission_codes: ["iam.user.manage"] },
      admin,
    );
    const uid = await createUser({ username: "editor", password: "pw" });
    await userService.setRoles(uid, { role_ids: [created.id] }, admin);

    const before = await version(uid);
    await roleService.update(
      created.id,
      { permission_codes: ["iam.audit.view"] },
      admin,
    );
    expect(await version(uid)).toBe(before + 1);
  });

  // 4.2
  it("rejects role deletion with a bad super-admin password (403, no writes)", async () => {
    const created = await roleService.create(
      { name: "Doomed", permission_codes: [] },
      admin,
    );
    const auditBefore = await conn.db.select({ count: count() }).from(auditLog);

    await expect(
      roleService.delete(created.id, "wrong-password", admin),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const stillThere = await conn.db
      .select({ id: role.id })
      .from(role)
      .where(eq(role.id, created.id));
    expect(stillThere).toHaveLength(1);

    const auditAfter = await conn.db.select({ count: count() }).from(auditLog);
    expect(auditAfter[0]?.count).toBe(auditBefore[0]?.count);
  });

  // 4.3
  it("blocks deletion of a bound role (409) and of a system role", async () => {
    const bound = await roleService.create(
      { name: "Bound", permission_codes: [] },
      admin,
    );
    const uid = await createUser({ username: "member", password: "pw" });
    await userService.setRoles(uid, { role_ids: [bound.id] }, admin);
    await expect(
      roleService.delete(bound.id, ADMIN_PASSWORD, admin),
    ).rejects.toBeInstanceOf(StateConflictError);

    const [sys] = await conn.db
      .insert(role)
      .values({ name: "System", isSystem: true })
      .returning({ id: role.id });
    await expect(
      roleService.delete((sys as { id: string }).id, ADMIN_PASSWORD, admin),
    ).rejects.toBeInstanceOf(StateConflictError);
  });

  // 4.4
  it("writes exactly one PERMISSION_CHANGE audit row per authz mutation", async () => {
    const created = await roleService.create(
      { name: "Audited", permission_codes: ["iam.user.manage"] },
      admin,
    );
    const rows = await conn.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("PERMISSION_CHANGE");
    expect(rows[0]?.actorUserId).toBe(admin.id);
    expect(rows[0]?.before).toBeNull();
    expect(rows[0]?.after).not.toBeNull();
    expect(rows[0]?.at).toBeInstanceOf(Date);
  });

  // 4.5
  it("locks the account after repeated bad logins; success resets the counter", async () => {
    await createUser({ username: "victim", password: "correct-pw" });

    for (let i = 0; i < 5; i++) {
      await expect(authService.login("victim", "wrong")).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    }

    const [locked] = await conn.db
      .select({ failed: user.failedLoginCount, lockedUntil: user.lockedUntil })
      .from(user)
      .where(eq(user.username, "victim"));
    expect(locked?.failed).toBe(5);
    expect(locked?.lockedUntil).not.toBeNull();
    expect((locked?.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());

    // Correct password while locked ⇒ still refused.
    await expect(
      authService.login("victim", "correct-pw"),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    // Expire the lock, then a correct login succeeds and resets the counter.
    await conn.db
      .update(user)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(user.username, "victim"));
    const pair = await authService.login("victim", "correct-pw");
    expect(pair.access_token).toBeTruthy();

    const [after] = await conn.db
      .select({ failed: user.failedLoginCount })
      .from(user)
      .where(eq(user.username, "victim"));
    expect(after?.failed).toBe(0);
  });

  // 4.6
  it("imports role→permission rows all-or-nothing; unknown codes roll back", async () => {
    const bad = await xlsx([
      ["role_name", "permission_codes"],
      ["BadRole", "iam.user.manage, nonexistent.code"],
    ]);
    await expect(importService.import(bad, admin)).rejects.toBeInstanceOf(
      ValidationError,
    );
    const notCreated = await conn.db
      .select({ id: role.id })
      .from(role)
      .where(eq(role.name, "BadRole"));
    expect(notCreated).toHaveLength(0);

    const good = await xlsx([
      ["role_name", "permission_codes"],
      ["Importers", "iam.audit.view iam.user.manage"],
    ]);
    const result = await importService.import(good, admin);
    expect(result.imported).toBe(1);

    const [importedRole] = await conn.db
      .select({ id: role.id })
      .from(role)
      .where(eq(role.name, "Importers"));
    expect(importedRole).toBeDefined();

    const grants = await conn.db
      .select({ code: permission.code })
      .from(rolePermission)
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(eq(rolePermission.roleId, (importedRole as { id: string }).id));
    expect(grants.map((g) => g.code).sort()).toEqual(
      ["iam.audit.view", "iam.user.manage"].sort(),
    );
  });
});
