import * as React from "react";
import type { Permission } from "@erp/contracts";
import { usePermissions } from "./permissions-context.js";

export interface HasPermissionProps {
  /** One permission, or several — any-of, matching the nav/module gating semantics. */
  required: Permission | Permission[];
  /** Rendered when the gate fails — defaults to nothing (absent, not disabled; spec §"Absent versus disabled"). */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/** Whether `gate` grants any of the required permission(s). Empty `required` is always allowed. */
export function checkHasPermission(
  gate: { has: (permission: Permission) => boolean; isSuperAdmin: boolean },
  required: Permission | Permission[],
): boolean {
  if (gate.isSuperAdmin) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.length === 0 || list.some(gate.has);
}

/**
 * Renders `children` only when the viewer holds `required` (any-of for an array), else `fallback`.
 * The one conditional-render gate every module reuses instead of hand-rolling permission checks.
 */
export function HasPermission({ required, fallback = null, children }: HasPermissionProps) {
  const gate = usePermissions();
  return <>{checkHasPermission(gate, required) ? children : fallback}</>;
}

/**
 * Thin HOC convenience over `<HasPermission>` for wrapping a whole component instead of its JSX
 * output — hooks + components remain the primary API (M0 frontend design D5).
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  required: Permission | Permission[],
  fallback: React.ReactNode = null,
): React.ComponentType<P> {
  function PermissionGated(props: P) {
    return (
      <HasPermission required={required} fallback={fallback}>
        <Component {...props} />
      </HasPermission>
    );
  }
  PermissionGated.displayName = `withPermission(${Component.displayName ?? Component.name ?? "Component"})`;
  return PermissionGated;
}
