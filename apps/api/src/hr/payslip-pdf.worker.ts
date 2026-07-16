import { Processor } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { PAYSLIP_PDF_JOB, PayslipService, type PayslipPdfJob } from "./payslip.service.js";

/**
 * The `pdf` queue payslip worker (design D5). Renders → encrypts (qpdf) → stores each
 * payslip PDF and sets `pdf_key`, idempotent on the payslip id (a re-run overwrites the
 * same object key). Ignores other `pdf`-queue jobs (e.g. inventory barcode labels).
 */
@Processor(QUEUES.pdf)
export class PayslipPdfWorker extends BaseWorker<PayslipPdfJob, { key: string } | null> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly payslips: PayslipService,
  ) {
    super();
  }

  async handle(job: Job<PayslipPdfJob>): Promise<{ key: string } | null> {
    if (job.name !== PAYSLIP_PDF_JOB) return null;
    const key = await this.uow.withTransaction(() =>
      this.payslips.generate(job.data.payslip_id),
    );
    return { key };
  }
}
