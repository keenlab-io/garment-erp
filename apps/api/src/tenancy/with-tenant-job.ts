import { BusinessRuleError } from "../common/errors/app-exception.js";
import { isTenantId, runWithTenant } from "./tenant-context.js";

/**
 * Jobs allowed to run with no tenant: the repeatable sweep *schedulers* (M7 design D11), whose
 * tick enumerates active tenants and fans out one tenant-scoped job each. Literal names (not the
 * business modules' constants) so the tenancy core imports no feature module.
 */
export const PLATFORM_JOBS: ReadonlySet<string> = new Set([
  "production.monitor.sweep", // PRODUCTION_MONITOR_JOB
  "sales.overdue.sweep", // SALES_OVERDUE_JOB
  "hr.probation.scan", // PROBATION_SCAN_JOB
  "reporting.mv-refresh", // MV_REFRESH_JOB (the fallback refresh spans every tenant's rows)
]);

/** The slice of a BullMQ `Job` this helper reads. */
export interface TenantJob {
  name: string;
  data: unknown;
}

/**
 * First line of every worker's `handle` (M7 design D11). ALS does not cross the queue's process
 * boundary, so the tenant travels in the payload: validate `job.data.tenantId` and run `fn`
 * inside `tenantContext` (`source: "job"`), so every transaction the job opens sets
 * `app.tenant_id` exactly as on the HTTP path. A job with no tenant fails loudly — unless it is
 * an allowlisted platform job, which runs unscoped.
 */
export async function withTenantJob<T>(job: TenantJob, fn: () => Promise<T>): Promise<T> {
  const tenantId =
    typeof job.data === "object" && job.data !== null
      ? (job.data as { tenantId?: unknown }).tenantId
      : undefined;

  if (tenantId === undefined || tenantId === null) {
    if (PLATFORM_JOBS.has(job.name)) return fn();
    throw new BusinessRuleError(`Job "${job.name}" carries no tenantId`);
  }
  if (!isTenantId(tenantId)) {
    throw new BusinessRuleError(`Job "${job.name}" carries a malformed tenantId`);
  }
  return runWithTenant(tenantId, "job", fn);
}
