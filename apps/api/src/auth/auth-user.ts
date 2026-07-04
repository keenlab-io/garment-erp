import type { Permission } from "@erp/contracts";

/**
 * The authenticated principal the `JwtGuard` attaches to `request.user`. Consumed
 * by `PermissionsGuard`, `assertPermissions`, and the `@CurrentUser()` decorator.
 */
export interface AuthUser {
  id: string;
  sessionId: string;
  isSuperAdmin: boolean;
  permissions: ReadonlySet<Permission>;
}
