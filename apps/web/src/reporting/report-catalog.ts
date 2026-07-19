import { COST_GATED_REPORT_GROUPS, REPORT_KEYS, ReportGroup, reportGroupForKey, type ReportKey } from "@erp/contracts";
import type { ReportingKey } from "../i18n/keys.js";

/**
 * i18n leaf key for a report's display label. `ReportKey`s (e.g. `"stock.balance"`) contain a
 * literal dot, which would collide with i18next's default key-path separator — the
 * `reporting:reportKeys` namespace therefore stores underscored leaves, and this is the one place
 * that translates between the wire key and the i18n key (M6 §4.2 report-viewer-ui).
 */
export function reportKeyLabelKey(key: string): ReportingKey {
  return `reporting:reportKeys.${key.replace(/\./g, "_")}` as ReportingKey;
}

/** The nav i18n key for a report group's dashboard — reused as the group's display label. */
export const REPORT_GROUP_LABEL_KEY: Record<ReportGroup, ReportingKey> = {
  [ReportGroup.INVENTORY]: "reporting:nav.dashboardInventory",
  [ReportGroup.SALES]: "reporting:nav.dashboardSales",
  [ReportGroup.COST]: "reporting:nav.dashboardCost",
  [ReportGroup.PROFIT]: "reporting:nav.dashboardProfit",
  [ReportGroup.TAX]: "reporting:nav.dashboardTax",
};

/** The full report catalog (`REPORT_KEYS`), grouped by `ReportGroup` and in catalog order — the
 * Reports-home browse list (M6 §4.2) and the schedule editor's report picker both walk this. */
export function reportKeysByGroup(): Record<ReportGroup, ReportKey[]> {
  const byGroup: Record<ReportGroup, ReportKey[]> = {
    [ReportGroup.INVENTORY]: [],
    [ReportGroup.SALES]: [],
    [ReportGroup.COST]: [],
    [ReportGroup.PROFIT]: [],
    [ReportGroup.TAX]: [],
  };
  for (const key of REPORT_KEYS) {
    const group = reportGroupForKey(key);
    if (group) byGroup[group].push(key);
  }
  return byGroup;
}

/** Whether `group` additionally requires `inventory.cost.view` on top of `report.<group>.view`
 * (`@erp/contracts`' `COST_GATED_REPORT_GROUPS`, matching `apps/api/src/reporting/report-access.ts`). */
export function isCostGatedGroup(group: ReportGroup): boolean {
  return COST_GATED_REPORT_GROUPS.includes(group);
}
