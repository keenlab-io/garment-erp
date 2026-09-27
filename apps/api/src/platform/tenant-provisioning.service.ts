import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { seedTenantDefaults, tenant, tenantDomain, type Db } from "@erp/db";
import type {
  TenantCreate,
  TenantKind,
  TenantListItem,
  TenantStatus,
  TenantStatusUpdate,
} from "@erp/contracts";
import { tryDecodeCursor } from "@erp/utils";
import { BusinessRuleError, NotFoundError } from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { normalizeHost } from "../tenancy/tenant-resolution.service.js";
import { PlatformAuditService } from "./platform-audit.service.js";

/** A slug is a DNS label: lower-case alphanumerics and inner hyphens, at most 63 characters. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Filters accepted by `GET /platform/tenants`. */
export interface TenantFilters {
  limit: number;
  cursor?: string;
  status?: TenantStatus;
  kind?: TenantKind;
}

interface TenantCursor {
  created_at: string;
  id: string;
}

const listColumns = {
  id: tenant.id,
  name: tenant.name,
  slug: tenant.slug,
  kind: tenant.kind,
  status: tenant.status,
  createdAt: tenant.createdAt,
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  kind: TenantKind;
  status: TenantStatus;
  createdAt: Date;
};

const toItem = (r: TenantRow): TenantListItem => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  kind: r.kind,
  status: r.status,
  created_at: r.createdAt.toISOString(),
});

/**
 * Tenant provisioning and lifecycle (M7 design D6/D14/D15). `provision` creates the `tenant` row,
 * its optional `tenant_domain`, and the per-tenant defaults (`seedTenantDefaults` — the same
 * function the dev seed and self-hosted boot use) in ONE transaction entered under the new
 * tenant (`runWithTenant(newId, "system", …)`), so the `app.tenant_id` GUC equals the id every
 * seeded row carries and the whole tenant appears atomically or not at all. Every control-plane
 * change writes a `platform_audit_log` row in the same transaction. A duplicate slug or hostname
 * hits its citext unique and surfaces as 409 via the global exception filter.
 */
@Injectable()
export class TenantProvisioningService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly audit: PlatformAuditService,
  ) {}

  async provision(
    input: TenantCreate,
    platformAdminId: string | null = null,
  ): Promise<TenantListItem> {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    const hostname = input.domain === undefined ? undefined : normalizeHost(input.domain);
    if (!name) throw new BusinessRuleError("Tenant name is required");
    if (!SLUG_RE.test(slug)) {
      throw new BusinessRuleError(
        "Tenant slug must be lower-case letters, digits and inner hyphens (max 63)",
      );
    }
    if (hostname !== undefined && !hostname) {
      throw new BusinessRuleError("Tenant domain must be a hostname");
    }

    const id = randomUUID();
    return runWithTenant(id, "system", () =>
      this.uow.withTransaction(async (tx) => {
        const [row] = await tx
          .insert(tenant)
          .values({ id, name, slug, kind: "CUSTOMER" })
          .returning(listColumns);
        if (hostname) {
          await tx.insert(tenantDomain).values({ hostname, tenantId: id });
        }
        await seedTenantDefaults(tx, id);

        const created = toItem(row as TenantRow);
        await this.audit.append({
          action: "CREATE",
          entityType: "tenant",
          entityId: id,
          tenantId: id,
          platformAdminId,
          after: { ...created, domain: hostname ?? null },
        });
        return created;
      }),
    );
  }

  /**
   * Self-hosted boot (design D15): make sure the single `slug` tenant exists, provisioning it
   * when missing. Idempotent — and tolerant of a concurrent boot (api + worker) winning the race.
   */
  async ensureTenant(slug: string, name = "Default"): Promise<TenantListItem> {
    const existing = await this.bySlug(slug);
    if (existing) return existing;
    try {
      return await this.provision({ name, slug });
    } catch (err) {
      const raced = await this.bySlug(slug);
      if (raced) return raced;
      throw err;
    }
  }

  async list(
    filters: TenantFilters,
  ): Promise<{ data: TenantListItem[]; next_cursor: string | null }> {
    const decoded = filters.cursor
      ? (tryDecodeCursor(filters.cursor) as TenantCursor | null)
      : null;
    const where = [
      filters.status ? eq(tenant.status, filters.status) : undefined,
      filters.kind ? eq(tenant.kind, filters.kind) : undefined,
      // `created_at` travels as Postgres text: microsecond-exact, unlike a JS Date.
      decoded
        ? sql`(${tenant.createdAt}, ${tenant.id}) < (${decoded.created_at}::timestamptz, ${decoded.id}::uuid)`
        : undefined,
    ].filter(Boolean);

    const rows = await currentExecutor(this.db)
      .select({ ...listColumns, cursorAt: sql<string>`${tenant.createdAt}::text` })
      .from(tenant)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(tenant.createdAt), desc(tenant.id))
      .limit(filters.limit + 1);

    const page = buildPage(rows as (TenantRow & { cursorAt: string })[], filters.limit, (r) => ({
      created_at: r.cursorAt,
      id: r.id,
    }));
    return { data: page.data.map(toItem), next_cursor: page.next_cursor };
  }

  /** Change a tenant's lifecycle status (reason required); audited with before/after. */
  async setStatus(
    id: string,
    update: TenantStatusUpdate,
    platformAdminId: string,
  ): Promise<TenantListItem> {
    const reason = update.reason.trim();
    if (!reason) throw new BusinessRuleError("A reason is required for this action");

    return this.uow.withTransaction(async (tx) => {
      const [current] = await tx
        .select(listColumns)
        .from(tenant)
        .where(eq(tenant.id, id))
        .for("update")
        .limit(1);
      if (!current) throw new NotFoundError("Tenant not found");

      const [row] = await tx
        .update(tenant)
        .set({
          status: update.status,
          updatedAt: new Date(),
          version: sql`${tenant.version} + 1`,
        })
        .where(eq(tenant.id, id))
        .returning(listColumns);

      const before = toItem(current as TenantRow);
      const after = toItem(row as TenantRow);
      await this.audit.append({
        action: "UPDATE",
        entityType: "tenant",
        entityId: id,
        tenantId: id,
        platformAdminId,
        before: { status: before.status },
        after: { status: after.status },
        reason,
      });
      return after;
    });
  }

  private async bySlug(slug: string): Promise<TenantListItem | null> {
    const [row] = await currentExecutor(this.db)
      .select(listColumns)
      .from(tenant)
      .where(eq(tenant.slug, slug))
      .limit(1);
    return row ? toItem(row as TenantRow) : null;
  }
}
