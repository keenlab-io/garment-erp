import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { plan, subscription, tenant, type Db, type Tx } from "@erp/db";
import {
  asMoney,
  type Subscription,
  type SubscriptionCreate,
  type SubscriptionStatus,
  type TenantStatus,
} from "@erp/contracts";
import { formatMoney, toDecimal } from "@erp/utils";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
} from "../../common/errors/app-exception.js";
import { DB } from "../../db/db.tokens.js";
import { currentExecutor } from "../../db/tx-context.js";
import { UnitOfWork } from "../../db/unit-of-work.service.js";
import { PlatformAuditService } from "../platform-audit.service.js";
import {
  TenantProvisioningService,
  type ProvisionedTenantInfo,
} from "../tenant-provisioning.service.js";
import { addYears, extendedTermEnd, type BillingPeriod } from "./billing-math.js";

export type SubscriptionRow = typeof subscription.$inferSelect;

/**
 * The subscription state machine (M9 design D3). The dunning sweep drives `ACTIVE → IN_GRACE →
 * EXPIRED`; mark-paid restores `ACTIVE` from any non-cancelled state; `CANCELLED` is a manual,
 * terminal state.
 */
export const SUBSCRIPTION_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, readonly SubscriptionStatus[]>
> = {
  ACTIVE: ["IN_GRACE", "CANCELLED"],
  IN_GRACE: ["ACTIVE", "EXPIRED", "CANCELLED"],
  EXPIRED: ["ACTIVE", "CANCELLED"],
  CANCELLED: [],
};

/** Throw 409 unless `from → to` is a subscription state-machine edge. */
export function assertSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void {
  if (!SUBSCRIPTION_TRANSITIONS[from].includes(to)) {
    throw new StateConflictError(`Subscription cannot move from ${from} to ${to}`, [
      {
        field: "status",
        issue: `allowed from ${from}: ${SUBSCRIPTION_TRANSITIONS[from].join(", ") || "none"}`,
      },
    ]);
  }
}

export const toSubscription = (r: SubscriptionRow): Subscription => ({
  id: r.id,
  tenant_id: r.tenantId,
  plan_id: r.planId,
  status: r.status,
  annual_fee: asMoney(r.annualFee),
  term_start: r.termStart.toISOString(),
  term_end: r.termEnd.toISOString(),
  cancelled_at: r.cancelledAt ? r.cancelledAt.toISOString() : null,
  created_at: r.createdAt.toISOString(),
});

/** Before/after of a payment applied to a subscription — folded into the mark-paid audit row. */
export interface AppliedPayment {
  before: { status: SubscriptionStatus; term_end: string };
  after: { status: SubscriptionStatus; term_end: string };
  subscription: SubscriptionRow;
}

/**
 * Vendor-side subscriptions (M9 §3.1, design D1/D3/D4). One non-cancelled subscription per
 * `CUSTOMER` tenant (409 otherwise — also backstopped by a partial unique index). Every mutation
 * writes a `platform_audit_log` row in its own transaction. Tenant lifecycle side effects go
 * through M8's `TenantProvisioningService.setStatus` (never a direct `tenant` write), and only ever
 * along `ACTIVE ↔ READ_ONLY` — no billing path sets a tenant `SUSPENDED` (design D3).
 *
 * The create-at-provisioning hook registers itself with provisioning: a new `CUSTOMER` tenant whose
 * plan carries a list price (`plan.annual_fee_min`) gets a one-year subscription at that fee in the
 * provisioning transaction; plans quoted per deal (no list price) and demo tenants get none — the
 * platform admin creates the subscription explicitly with the negotiated fee.
 */
@Injectable()
export class SubscriptionService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly audit: PlatformAuditService,
    private readonly tenants: TenantProvisioningService,
  ) {}

  onModuleInit(): void {
    this.tenants.onTenantProvisioned(async (t, adminId) => {
      await this.createAtProvisioning(t, adminId);
    });
  }

  /** The provisioning hook (task 3.1) — see the class doc for when a subscription is created. */
  async createAtProvisioning(
    info: ProvisionedTenantInfo,
    platformAdminId: string | null,
  ): Promise<Subscription | null> {
    if (info.kind !== "CUSTOMER" || !info.planId) return null;
    const [row] = await currentExecutor(this.db)
      .select({ annualFeeMin: plan.annualFeeMin })
      .from(plan)
      .where(eq(plan.id, info.planId))
      .limit(1);
    if (!row?.annualFeeMin) return null;
    const termStart = new Date();
    return this.uow.withTransaction((tx) =>
      this.insert(
        tx,
        {
          tenantId: info.tenantId,
          planId: info.planId as string,
          annualFee: row.annualFeeMin as string,
          termStart,
          termEnd: addYears(termStart, 1),
        },
        platformAdminId,
      ),
    );
  }

  async create(input: SubscriptionCreate, platformAdminId: string): Promise<Subscription> {
    const termStart = new Date(input.term_start);
    const termEnd = input.term_end ? new Date(input.term_end) : addYears(termStart, 1);
    if (termEnd.getTime() <= termStart.getTime()) {
      throw new BusinessRuleError("term_end must be after term_start", [
        { field: "term_end", issue: "must be after term_start" },
      ]);
    }
    if (toDecimal(input.annual_fee).isNegative()) {
      throw new BusinessRuleError("annual_fee must not be negative", [
        { field: "annual_fee", issue: "must be ≥ 0" },
      ]);
    }

    return this.uow.withTransaction(async (tx) => {
      const [t] = await tx
        .select({ kind: tenant.kind })
        .from(tenant)
        .where(eq(tenant.id, input.tenant_id))
        .limit(1);
      if (!t) throw new NotFoundError("Tenant not found");
      if (t.kind !== "CUSTOMER") {
        throw new BusinessRuleError("Only customer tenants carry subscriptions", [
          { field: "tenant_id", issue: `tenant kind is ${t.kind}` },
        ]);
      }
      const [p] = await tx.select({ id: plan.id }).from(plan).where(eq(plan.id, input.plan_id));
      if (!p) {
        throw new BusinessRuleError("Unknown plan", [{ field: "plan_id", issue: "not found" }]);
      }
      return this.insert(
        tx,
        {
          tenantId: input.tenant_id,
          planId: input.plan_id,
          annualFee: formatMoney(input.annual_fee),
          termStart,
          termEnd,
        },
        platformAdminId,
      );
    });
  }

  /** The tenant's live subscription, else its most recent cancelled one; 404 when it has none. */
  async getForTenant(tenantId: string): Promise<Subscription> {
    const [row] = await currentExecutor(this.db)
      .select()
      .from(subscription)
      .where(and(eq(subscription.tenantId, tenantId), sql`${subscription.deletedAt} IS NULL`))
      .orderBy(sql`(${subscription.status} = 'CANCELLED')`, desc(subscription.createdAt))
      .limit(1);
    if (!row) throw new NotFoundError("Tenant has no subscription");
    return toSubscription(row);
  }

  /**
   * Cancel (design D3): terminal. The tenant goes `READ_ONLY` pending export/purge under M8 rules
   * — never `SUSPENDED`.
   */
  async cancel(id: string, reason: string, platformAdminId: string): Promise<Subscription> {
    const why = reason.trim();
    if (!why) throw new BusinessRuleError("A reason is required for this action");
    return this.uow.withTransaction(async (tx) => {
      const current = await this.lock(tx, id);
      assertSubscriptionTransition(current.status, "CANCELLED");
      const now = new Date();
      const [row] = await tx
        .update(subscription)
        .set({
          status: "CANCELLED",
          cancelledAt: now,
          updatedAt: now,
          updatedBy: platformAdminId,
          version: sql`${subscription.version} + 1`,
        })
        .where(eq(subscription.id, id))
        .returning();
      const after = row as SubscriptionRow;
      await this.audit.append({
        action: "UPDATE",
        entityType: "subscription",
        entityId: id,
        tenantId: after.tenantId,
        platformAdminId,
        before: { status: current.status },
        after: { status: after.status, cancelled_at: now.toISOString() },
        reason: why,
      });
      await this.enterReadOnly(after.tenantId, `Subscription cancelled: ${why}`, platformAdminId);
      return toSubscription(after);
    });
  }

  /**
   * A time-driven move (the dunning sweep, design D3/D5): `ACTIVE → IN_GRACE` leaves the tenant
   * untouched; `→ EXPIRED` enters M8 `READ_ONLY`. Audited with a `null` admin when the sweep acts.
   */
  async transition(
    id: string,
    to: SubscriptionStatus,
    reason: string,
    platformAdminId: string | null = null,
  ): Promise<Subscription> {
    return this.uow.withTransaction(async (tx) => {
      const current = await this.lock(tx, id);
      assertSubscriptionTransition(current.status, to);
      const [row] = await tx
        .update(subscription)
        .set({
          status: to,
          updatedAt: new Date(),
          updatedBy: platformAdminId,
          version: sql`${subscription.version} + 1`,
        })
        .where(eq(subscription.id, id))
        .returning();
      const after = row as SubscriptionRow;
      await this.audit.append({
        action: "UPDATE",
        entityType: "subscription",
        entityId: id,
        tenantId: after.tenantId,
        platformAdminId,
        before: { status: current.status },
        after: { status: to },
        reason,
      });
      if (to === "EXPIRED") await this.enterReadOnly(after.tenantId, reason, platformAdminId);
      if (to === "ACTIVE" && current.status === "EXPIRED") {
        await this.exitReadOnly(after.tenantId, reason, platformAdminId);
      }
      return toSubscription(after);
    });
  }

  /**
   * Apply a paid invoice's period (design D1) inside the caller's mark-paid transaction: extend
   * `term_end` from the previous `term_end`, restore `ACTIVE`, and — when the subscription had
   * degraded to `EXPIRED` — bring the tenant out of `READ_ONLY`. The caller writes the audit row.
   */
  async applyPayment(
    tx: Tx,
    current: SubscriptionRow,
    period: BillingPeriod | null,
    platformAdminId: string,
  ): Promise<AppliedPayment> {
    if (current.status !== "ACTIVE") assertSubscriptionTransition(current.status, "ACTIVE");
    const termEnd = extendedTermEnd(current.termEnd, period);
    const [row] = await tx
      .update(subscription)
      .set({
        status: "ACTIVE",
        termEnd,
        updatedAt: new Date(),
        updatedBy: platformAdminId,
        version: sql`${subscription.version} + 1`,
      })
      .where(eq(subscription.id, current.id))
      .returning();
    if (current.status === "EXPIRED") {
      await this.exitReadOnly(current.tenantId, "Subscription invoice paid", platformAdminId);
    }
    return {
      before: { status: current.status, term_end: current.termEnd.toISOString() },
      after: { status: "ACTIVE", term_end: termEnd.toISOString() },
      subscription: row as SubscriptionRow,
    };
  }

  /** Lock a subscription row for update; 404 when missing. */
  async lock(tx: Tx, id: string): Promise<SubscriptionRow> {
    const [row] = await tx
      .select()
      .from(subscription)
      .where(and(eq(subscription.id, id), sql`${subscription.deletedAt} IS NULL`))
      .for("update")
      .limit(1);
    if (!row) throw new NotFoundError("Subscription not found");
    return row;
  }

  private async insert(
    tx: Tx,
    values: { tenantId: string; planId: string; annualFee: string; termStart: Date; termEnd: Date },
    platformAdminId: string | null,
  ): Promise<Subscription> {
    const [live] = await tx
      .select({ id: subscription.id })
      .from(subscription)
      .where(
        and(
          eq(subscription.tenantId, values.tenantId),
          ne(subscription.status, "CANCELLED"),
          sql`${subscription.deletedAt} IS NULL`,
        ),
      )
      .limit(1);
    if (live) {
      throw new StateConflictError("Tenant already has a live subscription", [
        { field: "tenant_id", issue: `subscription ${live.id} is not cancelled` },
      ]);
    }
    const [row] = await tx
      .insert(subscription)
      .values({ ...values, createdBy: platformAdminId, updatedBy: platformAdminId })
      .returning();
    const created = toSubscription(row as SubscriptionRow);
    await this.audit.append({
      action: "CREATE",
      entityType: "subscription",
      entityId: created.id,
      tenantId: created.tenant_id,
      platformAdminId,
      after: created,
    });
    return created;
  }

  /** M8 `ACTIVE → READ_ONLY` — a no-op unless the tenant is `ACTIVE` (never auto-`SUSPENDED`). */
  private async enterReadOnly(
    tenantId: string,
    reason: string,
    platformAdminId: string | null,
  ): Promise<void> {
    if ((await this.tenantStatus(tenantId)) !== "ACTIVE") return;
    await this.tenants.setStatus(tenantId, { status: "READ_ONLY", reason }, platformAdminId);
  }

  /** M8 `READ_ONLY → ACTIVE` — a no-op unless the tenant is `READ_ONLY` (suspension is manual). */
  private async exitReadOnly(
    tenantId: string,
    reason: string,
    platformAdminId: string | null,
  ): Promise<void> {
    if ((await this.tenantStatus(tenantId)) !== "READ_ONLY") return;
    await this.tenants.setStatus(tenantId, { status: "ACTIVE", reason }, platformAdminId);
  }

  private async tenantStatus(tenantId: string): Promise<TenantStatus | null> {
    const [row] = await currentExecutor(this.db)
      .select({ status: tenant.status })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);
    return row?.status ?? null;
  }
}
