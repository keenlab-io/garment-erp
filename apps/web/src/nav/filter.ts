import type { Permission } from "@erp/contracts";
import type { ModuleDescriptor } from "./types";
import { MODULE_CHILDREN } from "./registry";

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

/**
 * The path of a module's first sub-route the user may see, or `undefined` when the module has no
 * registered children (Dashboard) or none the user can open. Modules without a dedicated landing
 * page redirect their root here (router/route-tree.tsx) so selecting a section — from the sidebar,
 * mobile tab bar, or command palette — opens a real screen instead of the "coming soon" placeholder.
 */
export function firstVisibleChildPath(moduleKey: string, gate: NavGate): string | undefined {
  const children = MODULE_CHILDREN[moduleKey];
  return children?.find((child) => isModuleVisible(child, gate))?.path;
}
