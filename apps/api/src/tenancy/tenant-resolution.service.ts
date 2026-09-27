import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import {
  DEFAULT_TENANT_SLUG,
  tenant,
  tenantDomain,
  type Db,
  type DomainResolutionMode,
  type TenantStatus,
} from "@erp/db";
import { DB } from "../db/db.tokens.js";

/** A hostname resolved to its tenant (M7 design D5). */
export interface ResolvedTenant {
  tenantId: string;
  name: string;
  slug: string;
  status: TenantStatus;
  resolutionMode: DomainResolutionMode;
}

/**
 * Pre-login tenant resolution (M7 design D5/D15). Reads the control-plane `tenant` /
 * `tenant_domain` tables — both exempt from tenancy/RLS, so these are system-scoped reads on the
 * raw pool, never inside a tenant transaction. Only public (pre-login) paths consult it; after
 * login the token's `tid` claim is authoritative and the host is never used for scoping.
 */
@Injectable()
export class TenantResolutionService {
  private readonly selfHosted: boolean;
  private readonly defaultSlug: string;

  constructor(
    @Inject(DB) private readonly db: Db,
    config: ConfigService,
  ) {
    this.selfHosted = config.get<string>("DEPLOYMENT_MODE") === "self-hosted";
    this.defaultSlug = config.get<string>("DEFAULT_TENANT_SLUG") ?? DEFAULT_TENANT_SLUG;
  }

  /**
   * The tenant serving `host`, or `null` when no `tenant_domain` row maps it. Self-hosted
   * deployments short-circuit to the single `DEFAULT_TENANT_SLUG` tenant for any host, so a
   * factory's internal DNS needs no `tenant_domain` row.
   */
  async byHostname(host: string): Promise<ResolvedTenant | null> {
    if (this.selfHosted) return this.bySlug(this.defaultSlug);

    const hostname = normalizeHost(host);
    if (!hostname) return null;
    const [row] = await this.db
      .select({
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        resolutionMode: tenantDomain.resolutionMode,
      })
      .from(tenantDomain)
      .innerJoin(tenant, eq(tenant.id, tenantDomain.tenantId))
      .where(eq(tenantDomain.hostname, hostname))
      .limit(1);
    return row ?? null;
  }

  /** The lifecycle status of a tenant, or `null` if no such tenant exists. */
  async statusOf(tenantId: string): Promise<TenantStatus | null> {
    const [row] = await this.db
      .select({ status: tenant.status })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);
    return row?.status ?? null;
  }

  private async bySlug(slug: string): Promise<ResolvedTenant | null> {
    const [row] = await this.db
      .select({ tenantId: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status })
      .from(tenant)
      .where(eq(tenant.slug, slug))
      .limit(1);
    return row ? { ...row, resolutionMode: "TENANT" } : null;
  }
}

/** Lower-case, drop any `:port` and a trailing root dot. `hostname` is citext, but be explicit. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}
