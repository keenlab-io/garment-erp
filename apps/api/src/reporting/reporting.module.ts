import { Module } from "@nestjs/common";
import { DashboardService } from "./dashboard.service.js";
import { DigestService } from "./digest.service.js";
import { EmailWorker } from "./mail.worker.js";
import { ExportService } from "./export.service.js";
import { MailService } from "./mail.service.js";
import { MvRefreshSubscriber } from "./mv-refresh.subscriber.js";
import { MvRefreshWorker } from "./mv-refresh.worker.js";
import { ReportJobsWorker } from "./report-jobs.worker.js";
import { ReportScheduleService } from "./report-schedule.service.js";
import { ReportService } from "./report.service.js";
import { ReportingController } from "./reporting.controller.js";

/**
 * M6 Reporting & Analytics module (task 4.7). A read-only analytical lens over M2–M5: the report
 * catalog + cross-filtered dashboards read the three materialized views; async exports and cron
 * digests run on the `report`/`email` queues; and the event-driven `mv-refresh` subscriber keeps
 * the views current. Everything it depends on (DB, UnitOfWork, EventBus, Config, Queue, Pdf,
 * Storage) comes from the global M0 modules.
 */
@Module({
  controllers: [ReportingController],
  providers: [
    ReportService,
    DashboardService,
    ExportService,
    MailService,
    DigestService,
    ReportScheduleService,
    ReportJobsWorker,
    EmailWorker,
    MvRefreshSubscriber,
    MvRefreshWorker,
  ],
})
export class ReportingModule {}
