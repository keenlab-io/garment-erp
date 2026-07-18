import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { invoice, type Db } from "@erp/db";
import { formatMoney } from "@erp/utils";
import type { ExportFormat } from "@erp/contracts";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { PdfService } from "../pdf/pdf.service.js";
import { QUEUES } from "../queue/queue.constants.js";
import { StorageService } from "../storage/storage.service.js";
import { loadLines } from "./doc-lines.js";

export const SALES_EXPORT_JOB = "sales.export";
export const SALES_WHT_CERT_JOB = "sales.wht-certificate";

export interface SalesExportJob {
  invoice_id: string;
  format: ExportFormat;
}
export interface SalesWhtCertJob {
  invoice_id: string;
}

const EXT: Record<ExportFormat, string> = { pdf: "pdf", excel: "xlsx", jpg: "jpg" };

/**
 * Document export (task 5.7, design D10). `GET /invoices/{id}/export?format=` and the WHT
 * certificate enqueue `pdf`-queue jobs → 202 `{ job_id }`; the worker calls the `run*` methods,
 * which render the artifact (PDF/JPG via the shared Chromium, Excel via `exceljs`) and land it
 * in object storage through `StorageService`. Non-authoritative dev layout — the
 * `document_template` logo/signature/stamp wiring is deferred to the frontend milestone.
 */
@Injectable()
export class ExportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.pdf) private readonly queue: Queue,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
  ) {}

  /** Enqueue an invoice export; returns the job id for the 202 poll. */
  async enqueueExport(invoiceId: string, format: ExportFormat): Promise<{ job_id: string }> {
    await this.assertInvoice(invoiceId);
    const job = await this.queue.add(SALES_EXPORT_JOB, {
      invoice_id: invoiceId,
      format,
    } satisfies SalesExportJob);
    return { job_id: String(job.id ?? "") };
  }

  /** Enqueue a WHT certificate render; returns the job id for the 202 poll. */
  async enqueueWhtCertificate(invoiceId: string): Promise<{ job_id: string }> {
    await this.assertInvoice(invoiceId);
    const job = await this.queue.add(SALES_WHT_CERT_JOB, {
      invoice_id: invoiceId,
    } satisfies SalesWhtCertJob);
    return { job_id: String(job.id ?? "") };
  }

  /** Render + store the invoice in the requested format; returns the object key. */
  async runExport(invoiceId: string, format: ExportFormat): Promise<string> {
    const { inv, html, wb } = await this.buildInvoice(invoiceId);
    const key = `exports/invoice/${inv.docNo}.${EXT[format]}`;
    if (format === "excel") {
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      await this.storage.put(key, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } else if (format === "jpg") {
      await this.storage.put(key, await this.pdf.renderJpeg(html), "image/jpeg");
    } else {
      await this.storage.put(key, await this.pdf.renderHtml(html), "application/pdf");
    }
    return key;
  }

  /** Render + store the WHT certificate PDF; returns the object key. */
  async runWhtCertificate(invoiceId: string): Promise<string> {
    const ex = currentExecutor(this.db);
    const [inv] = await ex.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
    if (!inv) throw new NotFoundError(`Invoice not found: ${invoiceId}`);
    const html = `<!doctype html><html><body>
      <h1>Withholding Tax Certificate</h1>
      <p>Invoice: ${inv.docNo}</p>
      <p>WHT rate: ${inv.whtRate ?? "0"}</p>
      <p>WHT amount: ${formatMoney(inv.whtAmount)}</p>
    </body></html>`;
    const key = `exports/wht-certificate/${inv.docNo}.pdf`;
    await this.storage.put(key, await this.pdf.renderHtml(html), "application/pdf");
    return key;
  }

  private async assertInvoice(invoiceId: string): Promise<void> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ id: invoice.id })
      .from(invoice)
      .where(eq(invoice.id, invoiceId))
      .limit(1);
    if (!row) throw new NotFoundError(`Invoice not found: ${invoiceId}`);
  }

  private async buildInvoice(invoiceId: string): Promise<{
    inv: typeof invoice.$inferSelect;
    html: string;
    wb: ExcelJS.Workbook;
  }> {
    const ex = currentExecutor(this.db);
    const [inv] = await ex.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
    if (!inv) throw new NotFoundError(`Invoice not found: ${invoiceId}`);
    const lines = await loadLines(ex, "INVOICE", invoiceId);

    const rowsHtml = lines
      .map(
        (l) =>
          `<tr><td>${l.description}</td><td>${l.qty}</td><td>${l.unitPrice}</td><td>${l.lineTotal}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><body>
      <h1>Invoice ${inv.docNo}</h1>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <p>Subtotal: ${inv.subtotal}</p>
      <p>VAT: ${inv.vatAmount}</p>
      <p>WHT: ${inv.whtAmount}</p>
      <p>Grand total: ${inv.grandTotal}</p>
    </body></html>`;

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Invoice");
    sheet.addRow(["Invoice", inv.docNo]);
    sheet.addRow(["Description", "Qty", "Unit price", "Line total"]);
    for (const l of lines) sheet.addRow([l.description, l.qty, l.unitPrice, l.lineTotal]);
    sheet.addRow(["Subtotal", "", "", inv.subtotal]);
    sheet.addRow(["VAT", "", "", inv.vatAmount]);
    sheet.addRow(["WHT", "", "", inv.whtAmount]);
    sheet.addRow(["Grand total", "", "", inv.grandTotal]);

    return { inv, html, wb };
  }
}
