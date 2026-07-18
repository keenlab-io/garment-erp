import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { assertPermissions } from "../auth/authz.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth-user.js";
import { parseIfMatch } from "../common/concurrency/if-match.js";
import { NotFoundError } from "../common/errors/app-exception.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { DashboardService } from "./dashboard.service.js";
import { ExportService } from "./export.service.js";
import {
  requiredDashboardPermissions,
  requiredReportPermissions,
} from "./report-access.js";
import { ReportScheduleService } from "./report-schedule.service.js";
import { ReportService } from "./report.service.js";

/**
 * The M6 reporting surface (task 4.7). Read endpoints authorize in-handler via
 * `assertPermissions` with the report/dashboard's group permission — **cost/profit additionally
 * require `inventory.cost.view`** (design D5) — and an unknown report/dashboard key is a 404
 * (checked before the permission, so an unknown key never leaks a 403). Schedule mutations
 * (`report.schedule.manage`) run inside `uow.withTransaction` so the row write and its
 * repeatable-job reconciliation commit atomically.
 */
@Controller()
export class ReportingController {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly reports: ReportService,
    private readonly dashboards: DashboardService,
    private readonly exports: ExportService,
    private readonly schedules: ReportScheduleService,
  ) {}

  // ── Reports ──────────────────────────────────────────────────────────────

  @TsRestHandler(contract.reporting.getReport)
  getReport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.reporting.getReport, async ({ params, query }) => {
      this.authorizeReport(user, params.report_key);
      return { status: 200, body: await this.reports.run(params.report_key, query) };
    });
  }

  @TsRestHandler(contract.reporting.exportReport)
  exportReport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.reporting.exportReport, async ({ params, body }) => {
      this.authorizeReport(user, params.report_key);
      return {
        status: 202,
        body: await this.exports.enqueueExport(params.report_key, body.format, body.params),
      };
    });
  }

  @TsRestHandler(contract.reporting.getExport)
  getExport(@CurrentUser() _user: AuthUser) {
    // The job_id is an opaque handle the caller received from an authorized export; the poll
    // itself only requires authentication (JwtGuard, protected by default).
    return tsRestHandler(contract.reporting.getExport, async ({ params }) => {
      return { status: 200, body: await this.exports.getStatus(params.job_id) };
    });
  }

  // ── Dashboards ───────────────────────────────────────────────────────────

  @TsRestHandler(contract.reporting.getDashboard)
  getDashboard(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.reporting.getDashboard, async ({ params, query }) => {
      const perms = requiredDashboardPermissions(params.key);
      if (!perms) throw new NotFoundError(`Unknown dashboard: ${params.key}`);
      assertPermissions(user, ...perms);
      return { status: 200, body: await this.dashboards.get(params.key, query) };
    });
  }

  // ── Report schedules (report.schedule.manage) ────────────────────────────

  @TsRestHandler(contract.reporting.listReportSchedules)
  listReportSchedules(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.reporting.listReportSchedules, async ({ query }) => {
      assertPermissions(user, "report.schedule.manage");
      return { status: 200, body: await this.schedules.list(query) };
    });
  }

  @TsRestHandler(contract.reporting.createReportSchedule)
  createReportSchedule(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.reporting.createReportSchedule, async ({ body }) => {
      assertPermissions(user, "report.schedule.manage");
      const schedule = await this.uow.withTransaction(() =>
        this.schedules.create(body, user),
      );
      return { status: 201, body: { schedule } };
    });
  }

  @TsRestHandler(contract.reporting.updateReportSchedule)
  updateReportSchedule(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      contract.reporting.updateReportSchedule,
      async ({ params, headers, body }) => {
        assertPermissions(user, "report.schedule.manage");
        const expected = parseIfMatch(headers["if-match"]);
        const schedule = await this.uow.withTransaction(() =>
          this.schedules.update(params.id, expected, body, user),
        );
        return { status: 200, body: { schedule } };
      },
    );
  }

  @TsRestHandler(contract.reporting.deleteReportSchedule)
  deleteReportSchedule(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.reporting.deleteReportSchedule, async ({ params }) => {
      assertPermissions(user, "report.schedule.manage");
      await this.uow.withTransaction(() => this.schedules.remove(params.id));
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(contract.reporting.runReportScheduleNow)
  runReportScheduleNow(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.reporting.runReportScheduleNow, async ({ params }) => {
      assertPermissions(user, "report.schedule.manage");
      return { status: 202, body: await this.schedules.runNow(params.id) };
    });
  }

  /** Gate a report by its group permission; unknown key → 404, missing permission → 403. */
  private authorizeReport(user: AuthUser, reportKey: string): void {
    const perms = requiredReportPermissions(reportKey);
    if (!perms) throw new NotFoundError(`Unknown report: ${reportKey}`);
    assertPermissions(user, ...perms);
  }
}
