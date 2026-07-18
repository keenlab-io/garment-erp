import { Injectable } from "@nestjs/common";
import type { DashboardResult, ReportQuery } from "@erp/contracts";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DASHBOARD_PANELS } from "./dashboard-catalog.js";
import { ReportService } from "./report.service.js";
import { resolveWindow } from "./report-window.js";

/**
 * Cross-filtered dashboards (task 4.2, design D6). Resolves **one** window from the request's
 * `(dimension, value)` and runs every panel's report builder against that same window, so all
 * panels of a dashboard reflect an identical period. Each panel's `data` carries the applied
 * `window` alongside its `{ columns, rows, totals }` so the client can confirm the shared range.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly reports: ReportService) {}

  async get(key: string, query: ReportQuery): Promise<DashboardResult> {
    const panelKeys = DASHBOARD_PANELS[key];
    if (!panelKeys) throw new NotFoundError(`Unknown dashboard: ${key}`);

    // One window, resolved once, applied to every panel — the cross-filter invariant.
    const window = resolveWindow(query);
    const panels = [];
    for (const panelKey of panelKeys) {
      const result = await this.reports.runWindow(panelKey, query, window);
      panels.push({ key: panelKey, data: { window, ...result } });
    }
    return { panels };
  }
}
