import {
  COST_GATED_REPORT_GROUPS,
  reportGroupForKey,
  type Permission,
  type ReportGroup,
} from "@erp/contracts";
import { DASHBOARD_PANELS } from "./dashboard-catalog.js";

/** `report.<group>.view` code for a group (design D5). */
function groupViewPermission(group: ReportGroup): Permission {
  return `report.${group.toLowerCase()}.view` as Permission;
}

/**
 * The permission code(s) a report key requires (design D5). Every report needs its group's
 * `report.<group>.view`; **cost and profit** additionally require `inventory.cost.view`, so a
 * user holding only the group permission still gets 403 on those. Returns `null` for a key that
 * is not in the catalog — the caller renders that as a 404.
 */
export function requiredReportPermissions(reportKey: string): Permission[] | null {
  const group = reportGroupForKey(reportKey);
  if (!group) return null;
  const perms: Permission[] = [groupViewPermission(group)];
  if (COST_GATED_REPORT_GROUPS.includes(group)) perms.push("inventory.cost.view");
  return perms;
}

/**
 * The permission code(s) a dashboard requires — the de-duplicated union of every panel's report
 * permissions. Returns `null` for an unknown dashboard key (→ 404). A cost/profit dashboard
 * therefore also requires `inventory.cost.view`, matching its panels.
 */
export function requiredDashboardPermissions(key: string): Permission[] | null {
  const panels = DASHBOARD_PANELS[key];
  if (!panels) return null;
  const perms = new Set<Permission>();
  for (const panelKey of panels) {
    for (const code of requiredReportPermissions(panelKey) ?? []) perms.add(code);
  }
  return [...perms];
}
