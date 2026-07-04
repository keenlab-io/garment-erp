import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@erp/contracts";

export const PERMISSIONS_KEY = "permissions";

/**
 * Declares the permission codes required by a plain (non-ts-rest) controller
 * handler, enforced by `PermissionsGuard`. Codes are typed against the
 * `@erp/contracts` catalog, so a typo is a compile error. ts-rest endpoints use
 * in-handler `assertPermissions` instead (M0 design D7).
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
