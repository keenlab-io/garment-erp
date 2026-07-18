import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { assertPermissions } from "../auth/authz.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth-user.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { AgingReportService } from "./aging-report.service.js";
import { CustomerService } from "./customer.service.js";
import { EtaxService } from "./etax.service.js";
import { ExportService } from "./export.service.js";
import { InvoiceService } from "./invoice.service.js";
import { PaymentService } from "./payment.service.js";
import { PromptPayService } from "./promptpay.service.js";
import { QuotationService } from "./quotation.service.js";
import { VoidService } from "./void.service.js";

/**
 * The M5 sales surface (task 5.11). Every handler authorizes in-handler via `assertPermissions`
 * (M0 design D7) and wraps every mutation in `uow.withTransaction`, so document numbering,
 * totals, line materialization, lifecycle updates, and any in-transaction event commit
 * atomically. Replaces the retired demo `invoices` controller.
 */
@Controller()
export class SalesController {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly customers: CustomerService,
    private readonly quotations: QuotationService,
    private readonly invoices: InvoiceService,
    private readonly payments: PaymentService,
    private readonly voids: VoidService,
    private readonly promptpay: PromptPayService,
    private readonly exports: ExportService,
    private readonly etax: EtaxService,
    private readonly aging: AgingReportService,
  ) {}

  // ── Customers (sales.customer.manage) ───────────────────────────────────────

  @TsRestHandler(contract.sales.createCustomer)
  createCustomer(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.createCustomer, async ({ body }) => {
      assertPermissions(user, "sales.customer.manage");
      const customer = await this.uow.withTransaction(() =>
        this.customers.create(body, user),
      );
      return { status: 201, body: { customer } };
    });
  }

  @TsRestHandler(contract.sales.listCustomers)
  listCustomers(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.listCustomers, async ({ query }) => {
      assertPermissions(user, "sales.customer.manage");
      return { status: 200, body: await this.customers.list(query) };
    });
  }

  // ── Quotations (sales.quotation.manage) ─────────────────────────────────────

  @TsRestHandler(contract.sales.createQuotation)
  createQuotation(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.createQuotation, async ({ body }) => {
      assertPermissions(user, "sales.quotation.manage");
      const quotation = await this.uow.withTransaction(() =>
        this.quotations.create(body),
      );
      return { status: 201, body: { quotation } };
    });
  }

  @TsRestHandler(contract.sales.sendQuotation)
  sendQuotation(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.sendQuotation, async ({ params }) => {
      assertPermissions(user, "sales.quotation.manage");
      const quotation = await this.uow.withTransaction(() =>
        this.quotations.send(params.id),
      );
      return { status: 200, body: { quotation } };
    });
  }

  @TsRestHandler(contract.sales.approveQuotation)
  approveQuotation(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.approveQuotation, async ({ params }) => {
      assertPermissions(user, "sales.quotation.manage");
      const quotation = await this.uow.withTransaction(() =>
        this.quotations.approve(params.id, user),
      );
      return { status: 200, body: { quotation } };
    });
  }

  @TsRestHandler(contract.sales.rejectQuotation)
  rejectQuotation(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.rejectQuotation, async ({ params }) => {
      assertPermissions(user, "sales.quotation.manage");
      const quotation = await this.uow.withTransaction(() =>
        this.quotations.reject(params.id),
      );
      return { status: 200, body: { quotation } };
    });
  }

  @TsRestHandler(contract.sales.convertQuotation)
  convertQuotation(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.convertQuotation, async ({ params }) => {
      assertPermissions(user, "sales.invoice.create");
      const invoice = await this.uow.withTransaction(() =>
        this.quotations.convert(params.id),
      );
      return { status: 201, body: { invoice } };
    });
  }

  // ── Invoices (sales.invoice.create) ─────────────────────────────────────────

  @TsRestHandler(contract.sales.createInvoice)
  createInvoice(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.createInvoice, async ({ body }) => {
      assertPermissions(user, "sales.invoice.create");
      const invoice = await this.uow.withTransaction(() => this.invoices.create(body));
      return { status: 201, body: { invoice } };
    });
  }

  @TsRestHandler(contract.sales.issueInvoice)
  issueInvoice(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.issueInvoice, async ({ params }) => {
      assertPermissions(user, "sales.invoice.create");
      const invoice = await this.uow.withTransaction(() =>
        this.invoices.issue(params.id, user),
      );
      return { status: 200, body: { invoice } };
    });
  }

  @TsRestHandler(contract.sales.recordPayment)
  recordPayment(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.recordPayment, async ({ params, body }) => {
      assertPermissions(user, "sales.payment.record");
      const result = await this.uow.withTransaction(() =>
        this.payments.record(params.id, body, user),
      );
      return { status: 201, body: result };
    });
  }

  @TsRestHandler(contract.sales.voidInvoice)
  voidInvoice(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.voidInvoice, async ({ params, body }) => {
      assertPermissions(user, "sales.document.void");
      const invoice = await this.uow.withTransaction(() =>
        this.voids.voidInvoice(params.id, body.reason, user),
      );
      return { status: 200, body: { invoice } };
    });
  }

  @TsRestHandler(contract.sales.getInvoicePromptPayQr)
  getInvoicePromptPayQr(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.getInvoicePromptPayQr, async ({ params }) => {
      assertPermissions(user, "sales.payment.record");
      return { status: 200, body: await this.promptpay.qr(params.id) };
    });
  }

  @TsRestHandler(contract.sales.exportInvoice)
  exportInvoice(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.exportInvoice, async ({ params, query }) => {
      assertPermissions(user, "sales.invoice.create");
      return {
        status: 202,
        body: await this.exports.enqueueExport(params.id, query.format),
      };
    });
  }

  @TsRestHandler(contract.sales.getInvoiceWhtCertificate)
  getInvoiceWhtCertificate(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.getInvoiceWhtCertificate, async ({ params }) => {
      assertPermissions(user, "sales.invoice.create");
      return { status: 202, body: await this.exports.enqueueWhtCertificate(params.id) };
    });
  }

  // ── Reports & e-Tax ─────────────────────────────────────────────────────────

  @TsRestHandler(contract.sales.agingReport)
  agingReport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.agingReport, async ({ query }) => {
      assertPermissions(user, "report.sales.view");
      return { status: 200, body: { rows: await this.aging.report(query) } };
    });
  }

  @TsRestHandler(contract.sales.submitEtax)
  submitEtax(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.sales.submitEtax, async ({ params }) => {
      assertPermissions(user, "sales.etax.submit");
      return { status: 202, body: await this.etax.submit(params.invoice_id) };
    });
  }
}
