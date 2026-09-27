import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, tenant } from "@erp/db";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { PlatformAuditService } from "../../src/platform/platform-audit.service.js";
import { SelfHostedBootstrap } from "../../src/platform/self-hosted-bootstrap.service.js";
import { TenantProvisioningService } from "../../src/platform/tenant-provisioning.service.js";
import { TenantResolutionService } from "../../src/tenancy/tenant-resolution.service.js";

const url = process.env.DATABASE_URL_TEST;

// Gated on DATABASE_URL_TEST. M7 task 15.7 — self-hosted boot, against real Postgres. The
// `/platform/*`-routes-absent half of this acceptance is a module-wiring fact, already asserted
// without a DB in `platform.module.spec.ts`; this covers the two halves that need one:
// `SelfHostedBootstrap` provisions (and re-provisions idempotently) exactly the
// `DEFAULT_TENANT_SLUG` tenant, and — with `DEPLOYMENT_MODE=self-hosted` —
// `TenantResolutionService.byHostname` resolves *any* hostname to that same tenant (design D15:
// a factory's internal DNS needs no `tenant_domain` row).
describe.skipIf(!url)("self-hosted deployment boot (integration)", () => {
  let conn: ReturnType<typeof createDb>;
  const slug = `self-hosted-${randomUUID().slice(0, 8)}`;

  const config = {
    get: (key: string) =>
      ({ DEPLOYMENT_MODE: "self-hosted", DEFAULT_TENANT_SLUG: slug })[key],
  } as unknown as ConfigService;

  beforeAll(() => {
    conn = createDb(url as string, { max: 5 });
  });

  afterAll(async () => {
    await conn?.queryClient.end();
  });

  it("provisions exactly one tenant for DEFAULT_TENANT_SLUG, idempotently across boots", async () => {
    const uow = new UnitOfWork(conn.db);
    const provisioning = new TenantProvisioningService(conn.db, uow, new PlatformAuditService(conn.db));
    const bootstrap = new SelfHostedBootstrap(provisioning, config);

    await bootstrap.onApplicationBootstrap();
    await bootstrap.onApplicationBootstrap(); // a second boot must not create a second tenant

    const rows = await conn.db.select().from(tenant).where(eq(tenant.slug, slug));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug, status: "ACTIVE" });
  });

  it("resolves any hostname to the single self-hosted tenant", async () => {
    const [row] = await conn.db.select().from(tenant).where(eq(tenant.slug, slug));
    const tenantId = (row as { id: string }).id;

    const resolution = new TenantResolutionService(conn.db, config);
    for (const host of ["factory-floor.local", "192.168.1.50", "whatever.example:8080"]) {
      const resolved = await resolution.byHostname(host);
      expect(resolved).toMatchObject({ tenantId, slug, status: "ACTIVE" });
    }
  });
});
