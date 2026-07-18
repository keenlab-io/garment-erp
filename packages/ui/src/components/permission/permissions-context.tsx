import * as React from "react";
import type { Permission } from "@erp/contracts";

/** The permission surface every gate in this module reads. */
export interface PermissionsGate {
  /** Whether the current viewer holds the given permission (super admins always true). */
  has: (permission: Permission) => boolean;
  isSuperAdmin: boolean;
}

const PermissionsContext = React.createContext<PermissionsGate | null>(null);

export interface PermissionsProviderProps {
  children: React.ReactNode;
  /** Permission codes granted to the current viewer (ignored for a super admin). */
  permissions: readonly Permission[];
  /** Super admins bypass every gate, mirroring the backend `assertPermissions` semantics. */
  isSuperAdmin: boolean;
}

/**
 * Feeds the gating layer every module reuses (`usePermissions`, `<HasPermission>`, `<MaskedValue>`,
 * guarded-action dialogs) from the host app's session/auth state — `apps/web` wires this from its
 * session context; nothing here talks to a router or a data client (M0 frontend design D5).
 */
export function PermissionsProvider({ children, permissions, isSuperAdmin }: PermissionsProviderProps) {
  const value = React.useMemo<PermissionsGate>(
    () => ({
      isSuperAdmin,
      has: (permission) => isSuperAdmin || permissions.includes(permission),
    }),
    [permissions, isSuperAdmin],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/** Reads the gate a `<PermissionsProvider>` ancestor supplies — the single source every gate reads. */
export function usePermissions(): PermissionsGate {
  const ctx = React.useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within a <PermissionsProvider>");
  }
  return ctx;
}
