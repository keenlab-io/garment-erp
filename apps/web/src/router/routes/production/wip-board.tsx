import * as React from "react";
import { useTranslation } from "react-i18next";
import { Badge, Skeleton } from "@erp/ui";
import { useWipReportQuery } from "../../../production/queries.js";

/**
 * The WIP / bottleneck board (M4 §4.4, design MD4): one card per department with its in-progress
 * and delayed step counts, most-delayed first. The `production` contract resolves departments by
 * id only (no name join — the M2 department catalog isn't read here, mirroring the timeline row's
 * unresolved `customer_id`), so each card labels itself with the raw id.
 */
export function WipBoardPage() {
  const { t } = useTranslation("production");
  const wip = useWipReportQuery();

  const rows = [...(wip.data?.body.rows ?? [])].sort((a, b) => b.delayed_count - a.delayed_count);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("wip.title")}</h1>

      {wip.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : wip.isError ? (
        <p className="text-sm text-danger">{t("wip.loadError")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t("wip.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.department_id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4 shadow-sm"
            >
              <span className="truncate font-mono text-mono text-sm text-text-secondary">
                {t("wip.departmentLabel", { id: row.department_id })}
              </span>
              <div className="flex items-center gap-2">
                <Badge tone="info">{t("wip.inProgressLabel", { count: row.in_progress_count })}</Badge>
                {row.delayed_count > 0 && (
                  <Badge tone="danger">{t("wip.delayedLabel", { count: row.delayed_count })}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
