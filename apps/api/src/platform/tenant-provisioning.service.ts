import { randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { plan, seedTenantDefaults, tenant, tenantDomain, user, type Db } from "@erp/db";
import type {
  PlanCode,
  ProvisionedTenantAdmin,
  TenantCreate,
  TenantKind,
  TenantListItem,
  TenantProvisioned,
  TenantStatus,
  TenantStatusUpdate,
} from "@erp/contracts";
import { tryDecodeCursor } from "@erp/utils";
import { PasswordService } from "../auth/password.service.js";
import { BusinessRuleError, NotFoundError } from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import { normalizeHost } from "../tenancy/tenant-resolution.service.js";
import { PlatformAuditService } from "./platform-audit.service.js";
import { assertStatusTransition } from "./tenant-lifecycle.js";

/** A slug is a DNS label: lower-case alphanumerics and inner hyphens, at most 63 characters. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * `provisionTenant` input (M8 design D1): the platform contract's `TenantCreate` plus the knobs a
 * non-HTTP caller sets — M10 passes `kind: "DEMO_SANDBOX"`; self-hosted boot names its plan by
 * code. `plan_id` wins over `planCode`; with neither, the tenant gets the `WORKSHOP` plan.
 */
export interface ProvisionTenantInput extends TenantCreate {
  kind?: TenantKind;
  planCode?: PlanCode;
}

/** Plan a provisioned tenant falls back to when the caller names none. */
const DEFAULT_PLAN: PlanCode = "WORKSHOP";

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
 * Tenant provisioning and lifecycle (M7 design D6/D14/D15, M8 design D1). `provisionTenant` is the
 * ONE engine that makes a working tenant — cloud provisioning, self-hosted boot, and M10's demo
 * sandboxes all call it. It creates the `tenant` row (kind, plan), its optional `tenant_domain`,
 * the per-tenant config (`seedTenantDefaults` — sequences, `sso_config`, Thai `tax_bracket`s,
 * `advance_policy`, the default `document_template`; `report_schedule` starts empty), and the
 * first tenant super-admin with a hashed temporary password, in ONE transaction entered under the
 * new tenant (`runWithTenant(newId, "system", …)` — the one sanctioned place a platform path sets
 * `app.tenant_id` explicitly), so the whole tenant appears atomically or not at all. Every
 * control-plane change writes a `platform_audit_log` row in the same transaction. A duplicate
 * slug or hostname hits its citext unique and surfaces as 409 via the global exception filter.
 */
@Injectable()
export class TenantProvisioningService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly audit: PlatformAuditService,
    private readonly passwords: PasswordService,
  ) {}

  async provisionTenant(
    input: ProvisionTenantInput,
    platformAdminId: string | null = null,
  ): Promise<TenantProvisioned> {
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
    const adminEmail = input.admin_email?.trim().toLowerCase();
    // Hash outside the transaction — argon2id is deliberately slow.
    const tempPassword = adminEmail ? randomBytes(12).toString("base64url") : null;
    const passwordHash = tempPassword ? await this.passwords.hash(tempPassword) : null;

    const id = randomUUID();
    return runWithTenant(id, "system", () =>
      this.uow.withTransaction(async (tx) => {
        const planId = await this.resolvePlanId(input);
        const [row] = await tx
          .insert(tenant)
          .values({ id, name, slug, kind: input.kind ?? "CUSTOMER", planId })
          .returning(listColumns);
        if (hostname) {
          await tx.insert(tenantDomain).values({ hostname, tenantId: id, resolutionMode: "TENANT" });
        }
        await seedTenantDefaults(tx, id);

        let admin: ProvisionedTenantAdmin | null = null;
        if (adminEmail && tempPassword && passwordHash) {
          const [created] = await tx
            .insert(user)
            .values({
              tenantId: id,
              username: adminEmail,
              email: adminEmail,
              passwordHash,
              status: "ACTIVE",
              isSuperAdmin: true,
            })
            .returning({ id: user.id });
          admin = {
            id: (created as { id: string }).id,
            username: adminEmail,
            email: adminEmail,
            temp_password: tempPassword,
          };
        }

        const created = toItem(row as TenantRow);
        await this.audit.append({
          action: "CREATE",
          entityType: "tenant",
          entityId: id,
          tenantId: id,
          platformAdminId,
          after: {
            ...created,
            domain: hostname ?? null,
            plan_id: planId,
            admin: admin ? { id: admin.id, email: admin.email } : null,
          },
        });
        return { tenant: created, admin };
      }),
    );
  }

  /** The plan a new tenant gets: an explicit `plan_id` (must exist), else the plan by code. */
  private async resolvePlanId(input: ProvisionTenantInput): Promise<string | null> {
    const ex = currentExecutor(this.db);
    if (input.plan_id) {
      const [row] = await ex.select({ id: plan.id }).from(plan).where(eq(plan.id, input.plan_id));
      if (!row) throw new BusinessRuleError("Unknown plan", [{ field: "plan_id", issue: "not found" }]);
      return row.id;
    }
    // The plan catalog is seed data (M8 §2.3): a database without it provisions plan-less.
    const [row] = await ex
      .select({ id: plan.id })
      .from(plan)
      .where(eq(plan.code, input.planCode ?? DEFAULT_PLAN));
    return row?.id ?? null;
  }

  /**
   * Self-hosted boot (design D15): make sure the single `slug` tenant exists, provisioning it
   * when missing. Idempotent — and tolerant of a concurrent boot (api + worker) winning the race.
   */
  async ensureTenant(slug: string, name = "Default"): Promise<TenantListItem> {
    const existing = await this.bySlug(slug);
    if (existing) return existing;
    try {
      return (await this.provisionTenant({ name, slug, planCode: "SELFHOSTED" })).tenant;
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

  /**
   * Move a tenant along `ACTIVE ↔ READ_ONLY ↔ SUSPENDED` (reason required; 409 on any other edge —
   * PURGING is reachable only through the purge endpoint); audited with before/after. M9's
   * subscription expiry drives the same `ACTIVE → READ_ONLY` edge through here.
   */
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
      assertStatusTransition((current as TenantRow).status, update.status);

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
