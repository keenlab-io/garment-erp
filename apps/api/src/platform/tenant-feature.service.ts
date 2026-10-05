import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { tenant, tenantFeature, type Db } from "@erp/db";
import type { TenantFeature } from "@erp/contracts";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { EntitlementsService } from "./entitlements.service.js";
import { PlatformAuditService } from "./platform-audit.service.js";

/**
 * Platform-admin `tenant_feature` overrides (M8 design D2) — the add-on/upsell lever. Only platform
 * admins write them; tenants only read the resolved result (`GET /auth/me`). `tenant_feature` is
 * RLS-scoped like any business table, so every read/write runs under `runWithTenant(target,
 * "system")` — the control-plane path that sets `app.tenant_id` to the named tenant explicitly.
 * Each write appends a `platform_audit_log` row with the key's *effective* value before and after
 * (an override removal reverts to the plan default), in the same transaction as the write.
 */
@Injectable()
export class TenantFeatureService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly entitlements: EntitlementsService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(tenantId: string): Promise<TenantFeature[]> {
    return this.inTenant(tenantId, async () => {
      const rows = await currentExecutor(this.db)
        .select({ key: tenantFeature.key, enabled: tenantFeature.enabled })
        .from(tenantFeature)
        .where(eq(tenantFeature.tenantId, tenantId))
        .orderBy(asc(tenantFeature.key));
      return rows.map((r) => ({ tenant_id: tenantId, ...r }));
    });
  }

  async set(
    tenantId: string,
    key: string,
    enabled: boolean,
    platformAdminId: string,
  ): Promise<TenantFeature> {
    return this.inTenant(tenantId, async () => {
      const before = await this.effective(tenantId, key);
      await currentExecutor(this.db)
        .insert(tenantFeature)
        .values({ tenantId, key, enabled })
        .onConflictDoUpdate({
          target: [tenantFeature.tenantId, tenantFeature.key],
          set: { enabled },
        });
      await this.audit.append({
        action: "UPDATE",
        entityType: "tenant_feature",
        entityId: tenantId,
        tenantId,
        platformAdminId,
        before: { key, enabled: before },
        after: { key, enabled },
      });
      return { tenant_id: tenantId, key, enabled };
    });
  }

  /** Remove the override, reverting `key` to the plan default; 404 if no override exists. */
  async remove(tenantId: string, key: string, platformAdminId: string): Promise<void> {
    await this.inTenant(tenantId, async () => {
      const before = await this.effective(tenantId, key);
      const deleted = await currentExecutor(this.db)
        .delete(tenantFeature)
        .where(and(eq(tenantFeature.tenantId, tenantId), eq(tenantFeature.key, key)))
        .returning({ key: tenantFeature.key });
      if (deleted.length === 0) throw new NotFoundError("Feature override not found");
      await this.audit.append({
        action: "DELETE",
        entityType: "tenant_feature",
        entityId: tenantId,
        tenantId,
        platformAdminId,
        before: { key, enabled: before },
        after: { key, enabled: await this.effective(tenantId, key) },
      });
    });
  }

  /** The key's resolved value right now (override → plan default → off), uncached. */
  private async effective(tenantId: string, key: string): Promise<boolean> {
    return (await this.entitlements.resolve(tenantId, { fresh: true }))[key] === true;
  }

  /** Run `fn` in a transaction scoped to the (existing) target tenant; 404 for an unknown tenant. */
  private inTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return runWithTenant(tenantId, "system", () =>
      this.uow.withTransaction(async () => {
        const [row] = await currentExecutor(this.db)
          .select({ id: tenant.id })
          .from(tenant)
          .where(eq(tenant.id, tenantId))
          .limit(1);
        if (!row) throw new NotFoundError("Tenant not found");
        return fn();
      }),
    );
  }
}
