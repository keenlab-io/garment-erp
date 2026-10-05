import type { TenantStatus } from "@erp/contracts";
import { StateConflictError } from "../common/errors/app-exception.js";

/**
 * The tenant lifecycle (M8 tenant-provisioning spec): `ACTIVE ↔ READ_ONLY ↔ SUSPENDED → PURGING`.
 * The only moves `POST /platform/tenants/:id/status` may make. `PURGING` is absent on purpose —
 * it is entered only through the purge endpoint (SUSPENDED + typed confirmation), and is terminal.
 */
export const STATUS_TRANSITIONS: Readonly<Record<TenantStatus, readonly TenantStatus[]>> = {
  ACTIVE: ["READ_ONLY"],
  READ_ONLY: ["ACTIVE", "SUSPENDED"],
  SUSPENDED: ["READ_ONLY"],
  PURGING: [],
};

/** Throw 409 unless `from → to` is a lifecycle edge the status endpoint may take. */
export function assertStatusTransition(from: TenantStatus, to: TenantStatus): void {
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw new StateConflictError(`Tenant cannot move from ${from} to ${to}`, [
      { field: "status", issue: `allowed from ${from}: ${STATUS_TRANSITIONS[from].join(", ") || "none"}` },
    ]);
  }
}
