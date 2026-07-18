import { Processor } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { EtaxService, SALES_ETAX_JOB, type SalesEtaxJob } from "./etax.service.js";
import {
  ExportService,
  SALES_EXPORT_JOB,
  SALES_WHT_CERT_JOB,
  type SalesExportJob,
  type SalesWhtCertJob,
} from "./export.service.js";

/**
 * The `pdf`-queue worker for the M5 async document jobs (design D10/D12): invoice export
 * (PDF/Excel/JPG), the WHT certificate, and the non-authoritative e-Tax XML. Each `run*` call
 * renders + stores its artifact; returns the object key. Ignores foreign `pdf`-queue jobs
 * (payslips, barcode labels) by returning null.
 */
@Processor(QUEUES.pdf)
export class SalesJobsWorker extends BaseWorker<unknown, { key: string } | null> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly exports: ExportService,
    private readonly etax: EtaxService,
  ) {
    super();
  }

  async handle(job: Job): Promise<{ key: string } | null> {
    switch (job.name) {
      case SALES_EXPORT_JOB: {
        const data = job.data as SalesExportJob;
        const key = await this.uow.withTransaction(() =>
          this.exports.runExport(data.invoice_id, data.format),
        );
        return { key };
      }
      case SALES_WHT_CERT_JOB: {
        const data = job.data as SalesWhtCertJob;
        const key = await this.uow.withTransaction(() =>
          this.exports.runWhtCertificate(data.invoice_id),
        );
        return { key };
      }
      case SALES_ETAX_JOB: {
        const data = job.data as SalesEtaxJob;
        const key = await this.uow.withTransaction(() => this.etax.run(data.invoice_id));
        return { key };
      }
      default:
        return null;
    }
  }
}
