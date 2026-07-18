import { Inject, Injectable } from "@nestjs/common";
import type { Db } from "@erp/db";
import type { ReportQuery, ReportResult } from "@erp/contracts";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { REPORT_BUILDERS } from "./report-catalog.js";
import { resolveWindow, type ReportWindow } from "./report-window.js";

/**
 * The read-only report engine (task 4.1, design D4). Resolves a `report_key` to its catalog
 * builder and runs it against the M6 materialized views on the primary connection (design D1).
 * An unknown key is a 404. All access is authorized in the controller before this runs.
 */
@Injectable()
export class ReportService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Run a catalogued report for the given query, returning `{ columns, rows, totals }`. */
  async run(reportKey: string, query: ReportQuery): Promise<ReportResult> {
    return this.runWindow(reportKey, query, resolveWindow(query));
  }

  /**
   * Run a report against an explicit window — the cross-filtered dashboard threads one shared
   * window to every panel through this (design D6).
   */
  async runWindow(
    reportKey: string,
    query: ReportQuery,
    window: ReportWindow,
  ): Promise<ReportResult> {
    const build = REPORT_BUILDERS[reportKey];
    if (!build) throw new NotFoundError(`Unknown report: ${reportKey}`);
    return build(currentExecutor(this.db), window, query);
  }
}
