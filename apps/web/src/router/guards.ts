import { redirect } from "@tanstack/react-router";
import type { Session } from "../session/session-context";
import { isModuleVisible, type GatedEntry } from "../nav/filter";
import type { ModuleDescriptor } from "../nav/types";

/** Redirect to the login route when there is no authenticated session. */
export function requireSession(session: Session): void {
  if (!session.user) {
    throw redirect({ to: "/login" });
  }
}

/**
 * Guard a module route: require a session, then require entry access. A signed-in user who lacks
 * the module (reached it by typing the URL) is sent back to the dashboard — the module is never
 * theirs to see, matching the nav's absent-not-disabled rule.
 */
export function requireModuleAccess(session: Session, module: ModuleDescriptor): void {
  requireSession(session);
  const visible = isModuleVisible(module, {
    has: session.hasPermission,
    isSuperAdmin: session.isSuperAdmin,
  });
  if (!visible) {
    throw redirect({ to: "/" });
  }
}

/**
 * Guard a route that isn't a top-level nav module — an Admin & Access sub-route (Users/Roles/Audit/
 * Import lists and their `$id` details), gated directly by a permission set (+ optional Super-Admin
 * requirement) rather than a `ModuleDescriptor`. Same session + visibility gate as
 * `requireModuleAccess`, same absent-not-disabled outcome on failure.
 */
export function requireRouteAccess(session: Session, access: GatedEntry): void {
  requireSession(session);
  const visible = isModuleVisible(access, {
    has: session.hasPermission,
    isSuperAdmin: session.isSuperAdmin,
  });
  if (!visible) {
    throw redirect({ to: "/" });
  }
}
