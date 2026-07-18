import { Module } from "@nestjs/common";
import { AgingReportService } from "./aging-report.service.js";
import { CustomerService } from "./customer.service.js";
import { EtaxService } from "./etax.service.js";
import { ExportService } from "./export.service.js";
import { InvoiceService } from "./invoice.service.js";
import { OverdueMonitorWorker } from "./overdue-monitor.worker.js";
import { PaymentService } from "./payment.service.js";
import { PromptPayService } from "./promptpay.service.js";
import { QuotationService } from "./quotation.service.js";
import { SalesController } from "./sales.controller.js";
import { SalesJobsWorker } from "./sales-jobs.worker.js";
import { TotalsService } from "./totals.service.js";
import { VoidService } from "./void.service.js";

/**
 * M5 Sales Documents module (task 5.11). Customer master, the Quotation → Invoice →
 * Receipt/Tax-Invoice lifecycle (convert-once, partial-billing ceiling, server-computed VAT +
 * WHT), payments + receipts, void-with-audit, PromptPay QR, PDF/Excel/JPG + WHT-certificate +
 * e-Tax async jobs, the aging report, and the repeatable overdue sweep. Everything it depends
 * on (DB, UnitOfWork, EventBus, Config, Sequence, Queue, Pdf, Storage, Audit) comes from the
 * global M0 modules. Replaces the retired demo invoice module.
 */
@Module({
  controllers: [SalesController],
  providers: [
    TotalsService,
    CustomerService,
    QuotationService,
    InvoiceService,
    PaymentService,
    VoidService,
    PromptPayService,
    ExportService,
    EtaxService,
    AgingReportService,
    SalesJobsWorker,
    OverdueMonitorWorker,
  ],
})
export class SalesModule {}
