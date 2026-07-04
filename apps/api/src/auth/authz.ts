import type { Permission } from "@erp/contracts";
import { ForbiddenError } from "../common/errors/app-exception.js";
import type { AuthUser } from "./auth-user.js";

/**
 * In-handler authorization for ts-rest endpoints (M0 design D7). Because the
 * guards cannot see method-level metadata on ts-rest handlers, each endpoint calls
 * this with its required permission code(s). Super-admins bypass; anyone missing a
 * code gets a `ForbiddenError` → 403.
 */
export function assertPermissions(
  user: AuthUser,
  ...required: Permission[]
): void {
  if (user.isSuperAdmin) return;
  const missing = required.filter((code) => !user.permissions.has(code));
  if (missing.length > 0) {
    throw new ForbiddenError(
      `Missing required permission(s): ${missing.join(", ")}`,
    );
  }
}
