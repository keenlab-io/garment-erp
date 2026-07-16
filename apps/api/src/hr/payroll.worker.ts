import { Processor } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { ExportService, PAYROLL_EXPORT_JOB, type PayrollExportJob } from "./export.service.js";
import {
  PAYROLL_CALCULATE_JOB,
  PayrollService,
  type PayrollCalculateJob,
} from "./payroll.service.js";
import { ProbationService, PROBATION_SCAN_JOB } from "./probation.service.js";

/**
 * The `payroll` queue worker (design D4/D6). Handles the async run calculation (idempotent
 * on `(run_id, employee_id)`), the statutory export jobs, and the daily probation scan.
 * Each unit of work runs in a transaction so after-commit event dispatch never observes
 * uncommitted state.
 */
@Processor(QUEUES.payroll)
export class PayrollWorker extends BaseWorker<unknown, { ok: true } | null> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly payroll: PayrollService,
    private readonly exports: ExportService,
    private readonly probation: ProbationService,
  ) {
    super();
  }

  async handle(job: Job): Promise<{ ok: true } | null> {
    switch (job.name) {
      case PAYROLL_CALCULATE_JOB: {
        const data = job.data as PayrollCalculateJob;
        await this.uow.withTransaction(() => this.payroll.computeRun(data.run_id));
        return { ok: true };
      }
      case PAYROLL_EXPORT_JOB: {
        const data = job.data as PayrollExportJob;
        await this.uow.withTransaction(() => this.exports.run(data.kind, data.period));
        return { ok: true };
      }
      case PROBATION_SCAN_JOB: {
        await this.uow.withTransaction(() => this.probation.scan());
        return { ok: true };
      }
      default:
        return null;
    }
  }
}
