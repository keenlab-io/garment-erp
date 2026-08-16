import type { MeResponse } from "@erp/contracts";
import type { AuthUser } from "./dev-user.js";

/**
 * Maps the `GET /auth/me` response to the shell's `AuthUser` shape. Shared by `useLoginMutation`
 * (interactive login) and `restoreSession` (silent refresh on page load) so both derive identity
 * the same way.
 */
export function authUserFromMe(me: MeResponse): AuthUser {
  return {
    id: me.user.id,
    name: me.user.username,
    email: me.user.email,
    isSuperAdmin: me.user.is_super_admin,
    permissions: me.permissions,
  };
}
