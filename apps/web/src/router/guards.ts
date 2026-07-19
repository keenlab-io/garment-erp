import { redirect } from "@tanstack/react-router";
import { reportGroupForKey, type Permission } from "@erp/contracts";
import type { Session } from "../session/session-context";
import { isModuleVisible, type GatedEntry } from "../nav/filter";
import type { ModuleDescriptor } from "../nav/types";
import { REPORTS_PATH } from "../nav/reporting-paths";

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

/**
 * Guard `/reports/{report_key}` (M6 §1.2) — the report viewer serves all 16 report-catalog keys
 * through one dynamic route, each requiring a different `report.<group>.view` permission
 * (`REPORT_KEY_GROUP` in `@erp/contracts`), so the gate is computed from the route param rather
 * than a fixed `permissions` list. An unrecognized `report_key` (typo'd URL) sends the user back
 * to the Reports module home rather than the generic "/" fallback `requireRouteAccess` uses for a
 * permission failure — this isn't a permission problem, the key just doesn't exist.
 */
export function requireReportAccess(session: Session, reportKey: string): void {
  requireSession(session);
  const group = reportGroupForKey(reportKey);
  if (!group) {
    throw redirect({ to: REPORTS_PATH });
  }
  requireRouteAccess(session, {
    permissions: [`report.${group.toLowerCase()}.view` as Permission],
  });
}
