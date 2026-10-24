import type { AuthUser } from "../auth/auth-user.js";

/**
 * DI seam run by `POST /auth/logout` after the caller's session is revoked, inside the same
 * request transaction (M10 task 4.6). The demo module binds it so that signing out of a
 * `DEMO_SANDBOX` session purges the sandbox; unbound (self-hosted), logout is unchanged.
 */
export const LOGOUT_HOOK = Symbol("LOGOUT_HOOK");

export interface LogoutHook {
  afterLogout(user: AuthUser): Promise<void>;
}
