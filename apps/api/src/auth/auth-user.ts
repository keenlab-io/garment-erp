import type { Permission } from "@erp/contracts";

/**
 * The authenticated principal the `JwtGuard` attaches to `request.user`. Consumed
 * by `PermissionsGuard`, `assertPermissions`, and the `@CurrentUser()` decorator.
 */
export interface AuthUser {
  id: string;
  sessionId: string;
  /** The tenant the user authenticated into — the token's verified `tid` claim (M7). */
  tenantId: string;
  /** Set when the request runs under a platform support session (the token's `sup` claim). */
  supportSessionId?: string;
  isSuperAdmin: boolean;
  permissions: ReadonlySet<Permission>;
}
