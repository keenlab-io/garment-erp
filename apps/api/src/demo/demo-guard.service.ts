import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { tenant, type Db, type TenantKind } from "@erp/db";
import { DB } from "../db/db.tokens.js";
import { currentTenantId } from "../tenancy/tenant-context.js";

/** How long a tenant's kind is trusted from the in-process cache. */
export const DEMO_GUARD_TTL_MS = 60_000;
/** Above this many cached tenants the expired entries are pruned. */
const MAX_ENTRIES = 1_000;

/**
 * "Is the acting tenant a demo sandbox?" (M10 task 4.1, design D7) — the one question every egress
 * seam (mail, LINE, e-Tax, PromptPay, PDF) asks before doing anything that leaves the building.
 * Keyed on `tenant.kind`, which only provisioning ever sets — never on client state or feature
 * flags. Reads `currentTenantId()` (request `tid`, `withTenantJob` payload, or an explicit
 * `runWithTenant`), so callers pass nothing.
 *
 * `kind` is immutable for a tenant id, so a short-TTL in-process cache keyed by tenant id keeps
 * the per-request cost to one control-plane read per tenant per minute. The read is on the raw
 * pool: `tenant` is TENANT_EXEMPT, so no tenant GUC is needed. Outside any tenant scope, or for a
 * tenant id with no row, the answer is `false`.
 */
@Injectable()
export class DemoGuardService {
  private readonly cache = new Map<string, { kind: TenantKind | null; until: number }>();

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Whether the tenant in scope is a `DEMO_SANDBOX`. */
  async isDemoSandbox(): Promise<boolean> {
    const tenantId = currentTenantId();
    return tenantId !== null && (await this.kindOf(tenantId)) === "DEMO_SANDBOX";
  }

  /** `tenantId`'s kind (cached), or `null` when no such tenant exists. */
  async kindOf(tenantId: string, now = Date.now()): Promise<TenantKind | null> {
    const hit = this.cache.get(tenantId);
    if (hit && hit.until > now) return hit.kind;

    const [row] = await this.db
      .select({ kind: tenant.kind })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);
    const kind = row?.kind ?? null;
    if (this.cache.size >= MAX_ENTRIES) this.prune(now);
    this.cache.set(tenantId, { kind, until: now + DEMO_GUARD_TTL_MS });
    return kind;
  }

  private prune(now: number): void {
    for (const [id, entry] of this.cache) if (entry.until <= now) this.cache.delete(id);
    // Still full of live entries: start over rather than grow without bound.
    if (this.cache.size >= MAX_ENTRIES) this.cache.clear();
  }
}
