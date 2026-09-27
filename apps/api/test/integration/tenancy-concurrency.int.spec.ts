import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, tenant } from "@erp/db";
import type { AuthUser } from "../../src/auth/auth-user.js";
import {
  NotFoundError,
  StateConflictError,
} from "../../src/common/errors/app-exception.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { ReportScheduleService } from "../../src/reporting/report-schedule.service.js";
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST. M7 task 15.8 — the two cross-tenant concurrency regressions the
// design calls out by name: a stale `If-Match` never leaks a 409 across the tenant boundary
// (RLS hides the foreign row before `assertVersion` ever runs, so the caller sees 404), and a
// pagination cursor minted for one tenant is inert in another's scope (the service's explicit
// `inCallerTenant` predicate re-filters regardless of what keyset the cursor names). Uses
// `ReportScheduleService` — its `update()` looks a row up by id with no explicit tenant
// predicate (M7 §13.6), so the cross-tenant hide has to come from RLS itself; the integration
// connection is a superuser (RLS-exempt), so the If-Match probe runs as `erp_app` under `SET
// LOCAL ROLE`, mirroring `tenancy-auth.int.spec.ts`'s `asTenant` helper.
describe.skipIf(!url)("cross-tenant concurrency regressions (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let schedules: ReportScheduleService;
  let queue: Queue;

  const TENANT_A = randomUUID();
  const TENANT_B = randomUUID();

  const actorFor = (tenantId: string): AuthUser => ({
    id: randomUUID(),
    sessionId: randomUUID(),
    tenantId,
    isSuperAdmin: false,
    permissions: new Set(),
  });

  /** Run `fn` as tenant `tenantId`'s request would: tenant tx, RLS-bound runtime role. */
  const asTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    runWithTenant(tenantId, "jwt", () =>
      uow.withTransaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE erp_app`);
        return fn();
      }),
    );

  const inTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    runWithTenant(tenantId, "jwt", () => uow.withTransaction(fn));

  const create = (tenantId: string, name: string) =>
    inTenant(tenantId, () =>
      schedules.create(
        {
          name,
          report_key: "sales.overview",
          cron: "0 8 * * 1",
          recipients: ["ops@example.com"],
          format: "PDF",
          params: {},
          is_active: true,
        },
        actorFor(tenantId),
      ),
    );

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    uow = new UnitOfWork(conn.db);
    queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
      removeJobScheduler: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue;
    schedules = new ReportScheduleService(conn.db, queue);

    await conn.db
      .insert(tenant)
      .values([
        { id: TENANT_A, slug: `conc-a-${TENANT_A.slice(0, 8)}`, name: "Concurrency A", kind: "CUSTOMER" },
        { id: TENANT_B, slug: `conc-b-${TENANT_B.slice(0, 8)}`, name: "Concurrency B", kind: "CUSTOMER" },
      ]);
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("a stale If-Match against a foreign tenant's row 404s, never 409", async () => {
    const created = await create(TENANT_B, "B's digest");

    // Tenant A holds the *correct* current version for B's row (an attacker who somehow learned
    // it), yet the row is invisible under A's RLS scope — NotFoundError, not StateConflictError.
    await expect(
      asTenant(TENANT_A, () =>
        schedules.update(created.id, created.version, { name: "hijacked" }, actorFor(TENANT_A)),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Sanity: the very same call, from B's own scope, succeeds — the row was never actually gone.
    const updated = await asTenant(TENANT_B, () =>
      schedules.update(created.id, created.version, { name: "renamed" }, actorFor(TENANT_B)),
    );
    expect(updated.name).toBe("renamed");
    expect(updated.version).toBe(created.version + 1);

    // Contrast: a genuinely stale version *within* B's own tenant is the ordinary 409.
    await expect(
      asTenant(TENANT_B, () =>
        schedules.update(created.id, created.version, { name: "stale" }, actorFor(TENANT_B)),
      ),
    ).rejects.toBeInstanceOf(StateConflictError);
  });

  it("replaying tenant A's pagination cursor as tenant B yields only B's rows", async () => {
    // Fresh tenants — TENANT_A/TENANT_B already carry a schedule row from the previous test,
    // which would otherwise leak into `pageB.data` and defeat the exact-membership assertion
    // below (it belongs to TENANT_B, just not to this test's own `bRows`).
    const TENANT_A2 = randomUUID();
    const TENANT_B2 = randomUUID();
    await conn.db
      .insert(tenant)
      .values([
        { id: TENANT_A2, slug: `conc-a2-${TENANT_A2.slice(0, 8)}`, name: "Concurrency A2", kind: "CUSTOMER" },
        { id: TENANT_B2, slug: `conc-b2-${TENANT_B2.slice(0, 8)}`, name: "Concurrency B2", kind: "CUSTOMER" },
      ]);

    const aRows = await Promise.all([1, 2, 3].map((n) => create(TENANT_A2, `A-${n}`)));
    const bRows = await Promise.all([1, 2].map((n) => create(TENANT_B2, `B-${n}`)));

    const pageA = await inTenant(TENANT_A2, () => schedules.list({ limit: 1 }));
    expect(pageA.data).toHaveLength(1);
    expect(pageA.next_cursor).not.toBeNull();

    // B's own list, keyset-seeked with A's cursor — B's explicit tenant predicate wins over
    // whatever keyset the cursor names; the result is exactly (a subset of) B's own rows.
    const pageB = await inTenant(TENANT_B2, () =>
      schedules.list({ limit: 10, cursor: pageA.next_cursor as string }),
    );
    const aIds = new Set(aRows.map((r) => r.id));
    const bIds = new Set(bRows.map((r) => r.id));
    expect(pageB.data.some((r) => aIds.has(r.id))).toBe(false);
    expect(pageB.data.every((r) => bIds.has(r.id))).toBe(true);
  });
});
