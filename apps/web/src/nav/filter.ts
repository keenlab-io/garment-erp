import type { Permission } from "@erp/contracts";
import type { ModuleDescriptor } from "./types";

/** The permission surface nav filtering needs — satisfied by the session context. */
export interface NavGate {
  has: (permission: Permission) => boolean;
  isSuperAdmin: boolean;
}

/** The gating fields `isModuleVisible` actually reads — satisfied by a `ModuleDescriptor` or any
 * other route-metadata shape (e.g. `AdminRouteDescriptor` via `router/guards.ts`'s
 * `requireRouteAccess`) that carries the same permission/super-admin gate. */
export type GatedEntry = Pick<ModuleDescriptor, "permissions" | "superAdminOnly">;

/** Whether a single module (or other gated route entry) is visible to the current user. */
export function isModuleVisible(module: GatedEntry, gate: NavGate): boolean {
  if (module.superAdminOnly) return gate.isSuperAdmin;
  if (gate.isSuperAdmin) return true;
  if (!module.permissions || module.permissions.length === 0) return true;
  return module.permissions.some(gate.has);
}

/**
 * Filter the module registry to what the user may see. Unpermitted modules are **absent** from the
 * result (never rendered disabled) — the sidebar, tab bar, drawer, and command palette all consume
 * this, so a locked module appears nowhere in the DOM.
 */
export function filterNav(modules: ModuleDescriptor[], gate: NavGate): ModuleDescriptor[] {
  return modules.filter((module) => isModuleVisible(module, gate));
}
