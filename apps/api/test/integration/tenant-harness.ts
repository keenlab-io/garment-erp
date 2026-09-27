import { DEFAULT_TENANT_ID, type Tx } from "@erp/db";
import { UnitOfWork } from "../../src/db/unit-of-work.service.js";
import { currentTenantId, runWithTenant } from "../../src/tenancy/tenant-context.js";

/**
 * A `UnitOfWork` for specs that drive services directly (no request, no job): a transaction
 * opened with no tenant in scope runs as the default tenant — what an authenticated request of
 * a default-tenant user would do (JwtGuard → tenant scope → tenant transaction). Code that needs
 * the tenant beyond the GUC (job payloads via `tenantJobData`, tenant socket rooms) sees it too.
 * An explicit `runWithTenant` around the call still wins.
 */
export class DefaultTenantUnitOfWork extends UnitOfWork {
  override withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (currentTenantId() !== null) return super.withTransaction(fn);
    return runWithTenant(DEFAULT_TENANT_ID, "system", () => super.withTransaction(fn));
  }
}
