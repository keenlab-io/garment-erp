import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, tenant } from "@erp/db";
import { StateConflictError } from "../../src/common/errors/app-exception.js";
import { IdempotencyService } from "../../src/common/idempotency/idempotency.service.js";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { runWithTenant } from "../../src/tenancy/tenant-context.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST. M7 §7.5 / task 15.3 — idempotency records are keyed
// `(tenant_id, key, user_id)`: the same `Idempotency-Key` from the same user in two different
// tenants must not collide or replay across them, even though `key`/`userId` are identical.
// The tenant GUC is only set when a `UnitOfWork` transaction opens (M7 design D3), so every call
// below runs inside one — exactly how the `IdempotencyInterceptor` calls this service per request.
describe.skipIf(!url)("IdempotencyService is per-tenant (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  let uow: UnitOfWork;
  let service: IdempotencyService;

  const TENANT_A = randomUUID();
  const TENANT_B = randomUUID();
  const userId = randomUUID();
  const key = `shared-key-${randomUUID()}`;

  const lookup = (tenantId: string, requestHash: string) =>
    runWithTenant(tenantId, "jwt", () =>
      uow.withTransaction(() => service.lookup(key, userId, requestHash)),
    );
  const store = (tenantId: string, requestHash: string, body: unknown) =>
    runWithTenant(tenantId, "jwt", () =>
      uow.withTransaction(() => service.store(key, userId, requestHash, { status: 201, body })),
    );

  beforeAll(async () => {
    conn = createDb(url as string, { max: 5 });
    uow = new UnitOfWork(conn.db);
    service = new IdempotencyService(conn.db);
    await conn.db
      .insert(tenant)
      .values([
        { id: TENANT_A, slug: `idem-a-${TENANT_A.slice(0, 8)}`, name: "Idempotency A", kind: "CUSTOMER" },
        { id: TENANT_B, slug: `idem-b-${TENANT_B.slice(0, 8)}`, name: "Idempotency B", kind: "CUSTOMER" },
      ]);
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("the same (key, userId) replays independently per tenant", async () => {
    const requestHash = service.hashRequest({ amount: "100.0000" });

    // First use in each tenant: no prior record.
    expect(await lookup(TENANT_A, requestHash)).toBeNull();
    expect(await lookup(TENANT_B, requestHash)).toBeNull();

    await store(TENANT_A, requestHash, { tenant: "A" });

    // Tenant A now replays its own stored response…
    expect(await lookup(TENANT_A, requestHash)).toEqual({ status: 201, body: { tenant: "A" } });

    // …but tenant B, with the identical key and user, sees no record at all — first use.
    expect(await lookup(TENANT_B, requestHash)).toBeNull();

    await store(TENANT_B, requestHash, { tenant: "B" });
    expect(await lookup(TENANT_B, requestHash)).toEqual({ status: 201, body: { tenant: "B" } });

    // A key reused with a different body is a 409 *within* a tenant, and does not disturb the
    // other tenant's independent record.
    const otherHash = service.hashRequest({ amount: "999.0000" });
    await expect(lookup(TENANT_A, otherHash)).rejects.toBeInstanceOf(StateConflictError);
    expect(await lookup(TENANT_B, requestHash)).toEqual({ status: 201, body: { tenant: "B" } });
  });
});
