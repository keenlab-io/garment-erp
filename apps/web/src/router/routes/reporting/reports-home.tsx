import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ReportGroup, type Permission } from "@erp/contracts";
import { usePermissions } from "@erp/ui";
import { REPORTING_DASHBOARD_ROUTES } from "../../../nav/registry.js";
import { REPORTS_SCHEDULES_PATH } from "../../../nav/reporting-paths.js";
import { REPORT_GROUP_LABEL_KEY, isCostGatedGroup, reportKeyLabelKey, reportKeysByGroup } from "../../../reporting/report-catalog.js";

function groupViewPermission(group: ReportGroup): Permission {
  return `report.${group.toLowerCase()}.view` as Permission;
}

/**
 * The Reports module home (`/reports`, M6 §4.2 report-viewer-ui) — the browse surface the report
 * viewer's 16-key catalog has no other entry point for (`route-tree.tsx`'s `reportViewerRoute`
 * comment: "browsed from the Reports module home instead of enumerated individually"). Links to
 * each domain dashboard the viewer can enter, then the full catalog grouped by `ReportGroup`, each
 * group only listed once its `report.<group>.view` (and, for cost/profit, `inventory.cost.view`)
 * is held — an unreachable link is worse than an absent one (M0 design D5 "absent, not disabled").
 */
export function ReportsHomePage() {
  const { t } = useTranslation(["shell", "reporting"]);
  const { has } = usePermissions();
  const byGroup = reportKeysByGroup();
  const hasCostAccess = has("inventory.cost.view");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("shell:nav.reports")}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-body-strong text-text-primary">{t("reporting:home.dashboards")}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {REPORTING_DASHBOARD_ROUTES.filter((entry) => entry.permissions.some(has)).map((entry) => (
            <Link
              key={entry.key}
              to={entry.path}
              className="rounded-md border border-border bg-bg-surface px-4 py-3 text-sm font-medium text-text-primary hover:bg-bg-sunken"
            >
              {t(entry.titleKey)}
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-body-strong text-text-primary">{t("reporting:home.reportsCatalog")}</h2>
        {Object.values(ReportGroup).map((group) => {
          if (!has(groupViewPermission(group)) || (isCostGatedGroup(group) && !hasCostAccess)) return null;
          const keys = byGroup[group];
          return (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="text-caption font-medium uppercase tracking-wide text-text-muted">
                {t(REPORT_GROUP_LABEL_KEY[group])}
              </h3>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-bg-surface">
                {keys.map((key) => (
                  <li key={key}>
                    <Link
                      to="/reports/$reportKey"
                      params={{ reportKey: key }}
                      className="block px-4 py-2 text-sm text-text-primary hover:bg-bg-sunken"
                    >
                      {t(reportKeyLabelKey(key))}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {has("report.schedule.manage") && (
        <Link to={REPORTS_SCHEDULES_PATH} className="text-sm text-accent underline">
          {t("reporting:nav.schedules")}
        </Link>
      )}
    </div>
  );
}
