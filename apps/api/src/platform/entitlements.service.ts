import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { plan, tenant, tenantFeature, type Db } from "@erp/db";
import {
  ENTITLED_MODULES,
  moduleFeatureKey,
  moduleForPermission,
  type EntitledModule,
  type Permission,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { ForbiddenError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { currentTenant } from "../tenancy/tenant-context.js";

export type FeatureMap = Readonly<Record<string, boolean>>;

/**
 * A tenant that predates the plan catalog (`plan_id` NULL — only the pre-M8 default tenant until
 * the seed backfills it) keeps its pre-M8 behaviour: every module on. Every tenant with a plan
 * resolves strictly from that plan.
 */
const LEGACY_DEFAULTS: FeatureMap = Object.fromEntries(
  ENTITLED_MODULES.map((m) => [moduleFeatureKey(m), true]),
);

/**
 * Three-layer resolution (M8 design D2): an explicit `tenant_feature` row → the plan's `features`
 * default → off (a key absent from the returned map is off). Non-boolean plan values are ignored —
 * `plan.features` is jsonb, so be strict about what counts as "on".
 */
export function resolveFeatures(
  planDefaults: unknown,
  overrides: ReadonlyArray<{ key: string; enabled: boolean }>,
): FeatureMap {
  const resolved: Record<string, boolean> = {};
  if (planDefaults && typeof planDefaults === "object" && !Array.isArray(planDefaults)) {
    for (const [key, value] of Object.entries(planDefaults)) {
      if (typeof value === "boolean") resolved[key] = value;
    }
  }
  for (const { key, enabled } of overrides) resolved[key] = enabled;
  return resolved;
}

/**
 * Feature flags and module entitlements (M8 design D2) — the ONE resolution path for both
 * `module.*` keys and fine-grained flags. `resolve` is cached on the ambient `tenantContext` store,
 * so a request (or job) resolves at most once; a platform override therefore takes effect on the
 * tenant's next request, with no redeploy or re-login.
 *
 * `assertModuleEnabled` is the in-handler gate called beside `assertPermissions` in every gated
 * module controller. Tenant super-admins do NOT bypass it — entitlement is a property of the
 * tenant's plan, not of the user.
 */
@Injectable()
export class EntitlementsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The tenant's resolved feature map; `fresh` bypasses (and does not fill) the request cache. */
  async resolve(tenantId: string, opts: { fresh?: boolean } = {}): Promise<FeatureMap> {
    const store = currentTenant();
    const cacheable = !opts.fresh && store?.tenantId === tenantId;
    if (cacheable && store.features) return store.features;

    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ planId: tenant.planId, features: plan.features })
      .from(tenant)
      .leftJoin(plan, eq(plan.id, tenant.planId))
      .where(eq(tenant.id, tenantId))
      .limit(1);
    const overrides = await ex
      .select({ key: tenantFeature.key, enabled: tenantFeature.enabled })
      .from(tenantFeature)
      .where(eq(tenantFeature.tenantId, tenantId));

    const planDefaults = row && row.planId === null ? LEGACY_DEFAULTS : row?.features;
    const features = resolveFeatures(planDefaults, overrides);
    if (cacheable) store.features = features;
    return features;
  }

  /**
   * 403 FORBIDDEN naming the missing `module.*` key(s) when any of `codes`' modules is not
   * entitled for the caller's tenant — the module is derived from each permission code's first
   * segment, mirroring `assertPermissions(user, ...codes)`. Codes outside any gated module (IAM)
   * always pass, without touching the database.
   */
  async assertModuleEnabled(user: AuthUser, ...codes: Permission[]): Promise<void> {
    const modules = new Set<EntitledModule>();
    for (const code of codes) {
      const module = moduleForPermission(code);
      if (module !== null) modules.add(module);
    }
    if (modules.size === 0) return;

    const features = await this.resolve(user.tenantId);
    const missing = [...modules].filter((m) => features[moduleFeatureKey(m)] !== true);
    if (missing.length > 0) {
      throw new ForbiddenError(
        `Module not included in this organization's plan: ${missing.join(", ")}`,
        missing.map((m) => ({ field: moduleFeatureKey(m), issue: "module not in plan" })),
      );
    }
  }
}
