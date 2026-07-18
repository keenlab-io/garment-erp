import * as React from "react";
import type { Permission } from "@erp/contracts";
import { PermissionsProvider } from "@erp/ui";
import { type AuthUser, createDevUser } from "./dev-user";
import { api } from "../api/client.js";
import { clearTokens, getAccessToken } from "../api/token-store.js";

export interface Session {
  /** The signed-in user, or null when unauthenticated (login route renders). */
  user: AuthUser | null;
  /** Permission check with super-admin bypass — the single gate nav/palette/UI read. */
  hasPermission: (permission: Permission) => boolean;
  isSuperAdmin: boolean;
  /**
   * Commits a session. Called with no args, it restores the M0 dev stub; `useLoginMutation`
   * (M1 §2.1) calls it with the real `AuthUser` derived from `GET /auth/me` once login succeeds.
   */
  signIn: (user?: AuthUser) => void;
  /** Clears the session, revoking the token pair (best-effort backend call, then local clear). */
  signOut: () => void;
}

const SessionContext = React.createContext<Session | null>(null);

/**
 * Whether a user holds a permission. Super admins bypass the set entirely (empty-set super admins
 * still pass every check), mirroring the backend `assertPermissions` semantics. A null user (logged
 * out) holds nothing.
 */
export function userHasPermission(user: AuthUser | null, permission: Permission): boolean {
  if (!user) return false;
  return user.isSuperAdmin || user.permissions.includes(permission);
}

/**
 * Holds the authenticated session the whole shell reads (nav filtering, command palette, gating).
 * M0 seeds it with a dev user; M1 swaps the seed for a real login against the IAM contract without
 * touching consumers. The value is also threaded into the router context so route guards can read
 * it synchronously in `beforeLoad`.
 */
export function SessionProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  /** Seed the session (tests inject a controlled user); defaults to the dev user. */
  initialUser?: AuthUser | null;
}) {
  const [user, setUser] = React.useState<AuthUser | null>(
    () => (initialUser === undefined ? createDevUser() : initialUser),
  );

  const value = React.useMemo<Session>(
    () => ({
      user,
      isSuperAdmin: user?.isSuperAdmin ?? false,
      hasPermission: (permission: Permission) => userHasPermission(user, permission),
      signIn: (nextUser) => setUser(nextUser ?? createDevUser()),
      signOut: () => {
        // Fire the revoke while the token is still attached; clearing first would strip the
        // Authorization header before the request goes out.
        if (getAccessToken()) {
          void api.iam.logout.mutation({ body: undefined }).catch(() => {});
        }
        clearTokens();
        setUser(null);
      },
    }),
    [user],
  );

  return (
    <SessionContext.Provider value={value}>
      {/* Feeds @erp/ui's gating layer (usePermissions, HasPermission, MaskedValue, guarded-action
          dialogs) from this session — the one place apps/web wires auth state into it (M0 frontend
          design D5). */}
      <PermissionsProvider permissions={user?.permissions ?? []} isSuperAdmin={user?.isSuperAdmin ?? false}>
        {children}
      </PermissionsProvider>
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a <SessionProvider>");
  return ctx;
}
