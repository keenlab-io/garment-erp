import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { permission, plan, rolePermission, tenant, user, userRole, type Db } from "@erp/db";
import { SCAN_ONLY_PERMISSIONS, type SeatUsage } from "@erp/contracts";
import { BusinessRuleError, type ErrorDetail } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { currentTenantId } from "../tenancy/tenant-context.js";

/** An active/pending user and whether they occupy a seat (design D3). */
export interface SeatHolder {
  id: string;
  username: string;
  counted: boolean;
}

/** The tenant's seat cap: `plan.included_seats + tenant.extra_seats`, or `null` when plan-less. */
interface SeatCap {
  includedSeats: number | null;
  extraSeats: number;
}

const capOf = (c: SeatCap): number | null =>
  c.includedSeats === null ? null : c.includedSeats + c.extraSeats;

/**
 * The hard seat cap (design D3/D4/D5): a seat-promoting mutation is refused with 422 when, after
 * it, the counted total exceeds the cap. Only mutations that newly count someone are refused — an
 * already-over-cap tenant (plan downgraded) can still disable users or edit unrelated roles. The
 * details carry the cap, the current counted and exempt totals, and every user the mutation would
 * have promoted into a seat. A `null` cap (plan-less, pre-catalog tenant) is uncapped.
 */
export function assertCapacity(
  cap: number | null,
  countedBefore: ReadonlySet<string>,
  after: readonly SeatHolder[],
): void {
  if (cap === null) return;
  const counted = after.filter((u) => u.counted);
  const promoted = counted.filter((u) => !countedBefore.has(u.id));
  if (promoted.length === 0 || counted.length <= cap) return;

  const details: ErrorDetail[] = [
    { field: "seats", issue: "seat limit reached" },
    { field: "cap", issue: String(cap) },
    { field: "counted", issue: String(countedBefore.size) },
    { field: "exempt", issue: String(after.length - counted.length) },
    ...promoted.map((u) => ({ field: `user:${u.username}`, issue: "would occupy a seat" })),
  ];
  throw new BusinessRuleError(
    `Seat limit reached: ${countedBefore.size} of ${cap} seats are in use. ` +
      "Scan-only floor accounts stay free; add seats or upgrade the plan to add more users.",
    details,
  );
}

/**
 * Seat counting and the cap check (M8 design D3). A user occupies a seat iff not deleted, status
 * `PENDING`/`ACTIVE`, and their effective permission set (role→permission union; tenant super-admin
 * = everything) is NOT a subset of `SCAN_ONLY_PERMISSIONS` — scan-only (and role-less) floor
 * accounts are free and unlimited.
 *
 * `withSeatCheck` wraps every seat-promoting IAM mutation (user create / role assignment /
 * re-activation, role edit, permission import). It must run inside the mutation's transaction:
 * it locks the tenant row `FOR UPDATE` (the per-tenant serialization point, so two concurrent
 * creates cannot both slip under the cap), snapshots who is counted, applies the mutation, and
 * re-counts — the projected post-change total (design D4). On failure it throws, which rolls the
 * whole transaction back: nothing is written, no `permissions_version` bump survives.
 */
@Injectable()
export class SeatService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The caller tenant's counted vs. exempt seat usage (`GET /iam/seats`). */
  async usage(): Promise<SeatUsage> {
    const tenantId = await this.tenantInScope();
    const cap = await this.cap(tenantId, false);
    const holders = await this.holders(tenantId);
    const counted = holders.filter((h) => h.counted).length;
    return {
      included_seats: cap.includedSeats,
      extra_seats: cap.extraSeats,
      counted,
      exempt: holders.length - counted,
    };
  }

  /** Run `mutate` under the tenant seat lock, refusing it (422) if it would exceed the cap. */
  async withSeatCheck<T>(mutate: () => Promise<T>): Promise<T> {
    const tenantId = await this.tenantInScope();
    const cap = capOf(await this.cap(tenantId, true));
    if (cap === null) return mutate();

    const before = new Set(
      (await this.holders(tenantId)).filter((h) => h.counted).map((h) => h.id),
    );
    const result = await mutate();
    assertCapacity(cap, before, await this.holders(tenantId));
    return result;
  }

  /**
   * The tenant being mutated: the ambient tenant context, else the transaction's `app.tenant_id`
   * GUC — the scope RLS actually enforces on the writes being counted.
   */
  private async tenantInScope(): Promise<string> {
    const ambient = currentTenantId();
    if (ambient !== null) return ambient;
    const [row] = await currentExecutor(this.db).execute<{ tenant_id: string | null }>(
      sql`SELECT nullif(current_setting('app.tenant_id', true), '') AS tenant_id`,
    );
    if (!row?.tenant_id) throw new Error("Seat accounting requires a tenant in scope");
    return row.tenant_id;
  }

  private async cap(tenantId: string, lock: boolean): Promise<SeatCap> {
    const ex = currentExecutor(this.db);
    const query = ex
      .select({ planId: tenant.planId, extraSeats: tenant.extraSeats })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1);
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw new BusinessRuleError("Unknown tenant");
    if (row.planId === null) return { includedSeats: null, extraSeats: row.extraSeats };

    const [p] = await ex
      .select({ includedSeats: plan.includedSeats })
      .from(plan)
      .where(eq(plan.id, row.planId))
      .limit(1);
    return { includedSeats: p?.includedSeats ?? null, extraSeats: row.extraSeats };
  }

  /** Every seat-eligible (live, PENDING/ACTIVE) user in the tenant, flagged counted or exempt. */
  private async holders(tenantId: string): Promise<SeatHolder[]> {
    const scanOnly = sql.join(
      SCAN_ONLY_PERMISSIONS.map((code) => sql`${code}`),
      sql`, `,
    );
    const rows = await currentExecutor(this.db)
      .select({
        id: user.id,
        username: user.username,
        counted: sql<boolean>`(${user.isSuperAdmin} OR coalesce(bool_or(${permission.code} IS NOT NULL AND ${permission.code} NOT IN (${scanOnly})), false))`,
      })
      .from(user)
      .leftJoin(userRole, eq(userRole.userId, user.id))
      .leftJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
      .leftJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(
        and(
          eq(user.tenantId, tenantId),
          isNull(user.deletedAt),
          inArray(user.status, ["PENDING", "ACTIVE"]),
        ),
      )
      .groupBy(user.id);
    return rows.map((r) => ({ ...r, counted: r.counted === true }));
  }
}
