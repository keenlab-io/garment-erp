import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { currentTenantId } from "./tenant-context.js";

/**
 * Scope a lookup to the caller's tenant (M7 §9.1/§10.1). Natural keys (`emp_code`,
 * `payroll_run.period`, …) are unique per tenant only (`(tenant_id, …)` composite uniques), and
 * "first row" picks (the default warehouse) must never land on another tenant's row: RLS filters
 * it for the runtime role, and this explicit predicate keeps that true (and hits the composite
 * index) on an owner/superuser connection that bypasses RLS. Outside a tenant scope the predicate
 * is omitted and RLS alone decides.
 */
export function inCallerTenant(tenantIdColumn: AnyPgColumn, condition?: SQL): SQL {
  const tenantId = currentTenantId();
  if (tenantId === null) return condition ?? sql`true`;
  return condition
    ? (and(eq(tenantIdColumn, tenantId), condition) as SQL)
    : eq(tenantIdColumn, tenantId);
}
