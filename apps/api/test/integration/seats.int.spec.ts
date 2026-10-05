import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PERMISSION_CODES,
  createDb,
  permission,
  plan,
  tenant,
  tenantFeature,
  user,
} from "@erp/db";
import type { AuthUser } from "../../src/auth/auth-user.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { BusinessRuleError, ForbiddenError } from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { EventBusService } from "../../src/events/event-bus.service.js";
import { RoleService } from "../../src/iam/role.service.js";
import { UserService } from "../../src/iam/user.service.js";
import { EntitlementsService } from "../../src/platform/entitlements.service.js";
import { SeatService } from "../../src/platform/seat.service.js";
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST. M8 §5 — the seat cap against real SQL (counted-seat query,
// tenant-row lock, rollback on 422) and entitlement resolution from plan + `tenant_feature`.
// Runs in its own WORKSHOP tenant so the counts are independent of every other spec.
describe.skipIf(!url)("seats & entitlements (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let users: UserService;
  let roles: RoleService;
  let seats: SeatService;
  let entitlements: EntitlementsService;
  let tenantId: string;
  let actor: AuthUser;
  let officeRole: string;
  let scanRole: string;
  const run = randomUUID().slice(0, 8);

  const inTenant = <T>(fn: () => Promise<T>) => runWithTenant(tenantId, "jwt", fn);
  const createUser = (username: string, roleIds: string[]) =>
    inTenant(() =>
      users.create(
        { username, email: `${username}@test.local`, temp_password: "Temp-pass-123", role_ids: roleIds },
        actor,
      ),
    );
  const catchErr = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

  beforeAll(async () => {
    conn = createDb(url as string, { max: 1 });
    const uow = new UnitOfWork(conn.db);
    const events = new EventBusService(new EventEmitter2({ wildcard: true, delimiter: "." }));
    const passwords = new PasswordService();
    seats = new SeatService(conn.db);
    entitlements = new EntitlementsService(conn.db);
    users = new UserService(conn.db, passwords, uow, events, seats);
    roles = new RoleService(conn.db, passwords, uow, events, seats);

    await conn.db
      .insert(permission)
      .values(PERMISSION_CODES.map((code) => ({ code })))
      .onConflictDoNothing();
    await conn.db
      .insert(plan)
      .values({ code: "WORKSHOP", includedSeats: 8, features: { "module.sales": true } })
      .onConflictDoNothing();
    const [workshop] = await conn.db.select({ id: plan.id }).from(plan).where(eq(plan.code, "WORKSHOP"));

    tenantId = randomUUID();
    await conn.db.insert(tenant).values({
      id: tenantId,
      slug: `seats-${run}`,
      name: "Seats tenant",
      kind: "CUSTOMER",
      planId: (workshop as { id: string }).id,
    });
    const [admin] = await conn.db
      .insert(user)
      .values({
        tenantId,
        username: `admin-${run}`,
        email: `admin-${run}@test.local`,
        passwordHash: "x",
        status: "ACTIVE",
        isSuperAdmin: true,
      })
      .returning({ id: user.id });
    actor = {
      id: (admin as { id: string }).id,
      sessionId: "s",
      tenantId,
      isSuperAdmin: true,
      permissions: new Set(),
    };

    officeRole = (
      await inTenant(() =>
        roles.create({ name: "Office", permission_codes: ["sales.invoice.create"] }, actor),
      )
    ).id;
    scanRole = (
      await inTenant(() =>
        roles.create({ name: "Scanner", permission_codes: ["production.scan"] }, actor),
      )
    ).id;
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("enforces the cap on create, exempts scan-only accounts, and frees seats on disable", async () => {
    const start = await inTenant(() => seats.usage());
    expect(start.counted).toBe(1); // the tenant super-admin
    const cap = (start.included_seats as number) + start.extra_seats;

    for (let i = start.counted; i < cap; i++) await createUser(`office${i}-${run}`, [officeRole]);
    expect((await inTenant(() => seats.usage())).counted).toBe(cap);

    const refused = await catchErr(createUser(`over-${run}`, [officeRole]));
    expect(refused).toBeInstanceOf(BusinessRuleError);
    expect((refused as BusinessRuleError).details).toEqual(
      expect.arrayContaining([
        { field: "cap", issue: String(cap) },
        { field: "counted", issue: String(cap) },
        { field: `user:over-${run}`, issue: "would occupy a seat" },
      ]),
    );
    const [ghost] = await conn.db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.username, `over-${run}`)));
    expect(ghost).toBeUndefined();

    for (let i = 0; i < 3; i++) await createUser(`scan${i}-${run}`, [scanRole]);
    expect(await inTenant(() => seats.usage())).toMatchObject({ counted: cap, exempt: 3 });

    // A role edit that would promote the three scanners is refused with their names, unchanged.
    const edit = await catchErr(
      inTenant(() =>
        roles.update(scanRole, { permission_codes: ["production.scan", "hr.payslip.view"] }, actor),
      ),
    );
    expect(edit).toBeInstanceOf(BusinessRuleError);
    const named = (edit as BusinessRuleError).details
      .map((d) => d.field)
      .filter((f) => f?.startsWith("user:"));
    expect(named?.sort()).toEqual([0, 1, 2].map((i) => `user:scan${i}-${run}`).sort());
    expect((await inTenant(() => roles.get(scanRole))).permission_codes).toEqual(["production.scan"]);

    // DISABLED frees a seat; re-activating while full is refused.
    const office = await conn.db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.username, `office1-${run}`)));
    const officeId = (office[0] as { id: string }).id;
    await inTenant(() => users.setStatus(officeId, "DISABLED", actor));
    await createUser(`replacement-${run}`, [officeRole]);
    const reactivate = await catchErr(inTenant(() => users.setStatus(officeId, "ACTIVE", actor)));
    expect(reactivate).toBeInstanceOf(BusinessRuleError);
  });

  it("resolves modules from the plan with tenant_feature overrides winning", async () => {
    const salesUser = { ...actor, isSuperAdmin: false };
    await inTenant(() => entitlements.assertModuleEnabled(salesUser, "sales.invoice.create"));
    const denied = await catchErr(
      inTenant(() => entitlements.assertModuleEnabled(actor, "hr.employee.view")),
    );
    expect(denied).toBeInstanceOf(ForbiddenError);

    await conn.db.insert(tenantFeature).values({ tenantId, key: "module.hr", enabled: true });
    await inTenant(() => entitlements.assertModuleEnabled(actor, "hr.employee.view"));
  });
});
