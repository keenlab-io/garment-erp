import { moduleForPermission, type EntitledModule, type Permission } from "@erp/contracts";
import type { ModuleDescriptor } from "./types";
import { MODULE_CHILDREN } from "./registry";

/** The permission surface nav filtering needs — satisfied by the session context. */
export interface NavGate {
  has: (permission: Permission) => boolean;
  isSuperAdmin: boolean;
  /**
   * Whether the tenant's plan entitles a gated module (M8 §7.2, from `/auth/me`). Absent = every
   * module is entitled (dev stub, tests). Unlike permissions there is no super-admin bypass: a
   * module outside the plan is unavailable to everyone, exactly as the api enforces it.
   */
  entitled?: (module: EntitledModule) => boolean;
}

/** The gating fields `isModuleVisible` actually reads — satisfied by a `ModuleDescriptor` or any
 * other route-metadata shape (e.g. `AdminRouteDescriptor` via `router/guards.ts`'s
 * `requireRouteAccess`) that carries the same permission/super-admin gate. */
export type GatedEntry = Pick<ModuleDescriptor, "permissions" | "superAdminOnly">;

/** Whether a single module (or other gated route entry) is visible to the current user. */
export function isModuleVisible(module: GatedEntry, gate: NavGate): boolean {
  if (module.superAdminOnly) return gate.isSuperAdmin;
  // A route whose every permission belongs to a module outside the plan is absent, even for a
  // super admin. Permissions outside any gated module (IAM) never trip this.
  if (gate.entitled && module.permissions && module.permissions.length > 0) {
    const { entitled } = gate;
    const reachable = module.permissions.some((p) => {
      const gated = moduleForPermission(p);
      return gated === null || entitled(gated);
    });
    if (!reachable) return false;
  }
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
