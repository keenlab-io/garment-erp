import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { employee, payslip, user, type Db } from "@erp/db";
import { formatMoney } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import { CryptoService } from "../common/crypto/crypto.service.js";
import {
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { PdfService } from "../pdf/pdf.service.js";
import { StorageService } from "../storage/storage.service.js";
import { QUEUES } from "../queue/queue.constants.js";
import { HR_EVENTS, type PayslipGeneratedPayload } from "./hr.events.js";
import { encryptPdf } from "./pdf-encrypt.js";
import type { PayslipBreakdown } from "./payroll-math.js";

/** The job the payslip PDF worker consumes off the `pdf` queue. */
export const PAYSLIP_PDF_JOB = "payslip.pdf";
export interface PayslipPdfJob {
  payslip_id: string;
}

/**
 * e-Payslip generation & delivery (task 4.7, design D5). `enqueueGeneration` schedules a
 * `pdf` worker job (called per payslip when a run is approved); `generate` renders → encrypts
 * (qpdf, password = the employee's national ID) → stores → sets `pdf_key` → emits
 * `PayslipGenerated`, idempotent on the payslip id. `getPdfUrl` returns a signed, expiring
 * URL — authorized for the payslip's own employee (self) or a `hr.payslip.view` holder.
 */
@Injectable()
export class PayslipService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.pdf) private readonly queue: Queue,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
    private readonly events: EventBusService,
  ) {}

  /** Schedule PDF generation for a payslip (fire-and-forget onto the `pdf` queue). */
  enqueueGeneration(payslipId: string): void {
    void this.queue.add(PAYSLIP_PDF_JOB, { payslip_id: payslipId } satisfies PayslipPdfJob);
  }

  /**
   * Render, encrypt, and store a payslip PDF; set `pdf_key`. Idempotent — a re-run
   * overwrites the same object key. Called by the worker.
   */
  async generate(payslipId: string): Promise<string> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({
        id: payslip.id,
        runId: payslip.runId,
        employeeId: payslip.employeeId,
        breakdown: payslip.breakdown,
        gross: payslip.gross,
        net: payslip.net,
        empCode: employee.empCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        nationalIdEnc: employee.nationalIdEnc,
      })
      .from(payslip)
      .innerJoin(employee, eq(payslip.employeeId, employee.id))
      .where(eq(payslip.id, payslipId))
      .limit(1);
    if (!row) throw new NotFoundError("Payslip not found");

    const html = renderPayslipHtml({
      empCode: row.empCode,
      name: `${row.firstName} ${row.lastName}`,
      gross: row.gross,
      net: row.net,
      breakdown: row.breakdown as PayslipBreakdown,
    });
    const rendered = await this.pdf.renderHtml(html);
    // Per-employee open password defaults to the national ID (spec §2.5); fall back to the
    // emp_code when PII is absent so the PDF is always protected.
    const password = row.nationalIdEnc
      ? this.crypto.decrypt(Buffer.from(row.nationalIdEnc))
      : row.empCode;
    const encrypted = await encryptPdf(rendered, password);

    const key = `payslips/${row.runId}/${row.id}.pdf`;
    await this.storage.put(key, encrypted, "application/pdf");
    await ex.update(payslip).set({ pdfKey: key }).where(eq(payslip.id, payslipId));

    this.events.publishAfterCommit(
      makeEvent<PayslipGeneratedPayload>({
        event: HR_EVENTS.payslipGenerated,
        payload: { payslip_id: row.id, employee_id: row.employeeId, pdf_key: key },
      }),
    );
    return key;
  }

  /** A signed, expiring URL to the encrypted PDF — authorized for self or hr.payslip.view. */
  async getPdfUrl(payslipId: string, actor: AuthUser): Promise<string> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ employeeId: payslip.employeeId, pdfKey: payslip.pdfKey })
      .from(payslip)
      .where(eq(payslip.id, payslipId))
      .limit(1);
    if (!row) throw new NotFoundError("Payslip not found");

    await this.assertCanView(actor, row.employeeId);
    if (!row.pdfKey) {
      throw new StateConflictError("Payslip PDF has not been generated yet");
    }
    return this.storage.getSignedUrl(row.pdfKey);
  }

  /** Allow the payslip's own employee (self) or a `hr.payslip.view` holder / super-admin. */
  private async assertCanView(actor: AuthUser, employeeId: string): Promise<void> {
    if (actor.isSuperAdmin || actor.permissions.has("hr.payslip.view")) return;
    const ex = currentExecutor(this.db);
    const [me] = await ex
      .select({ employeeId: user.employeeId })
      .from(user)
      .where(eq(user.id, actor.id))
      .limit(1);
    if (!me || me.employeeId !== employeeId) {
      throw new ForbiddenError("Not permitted to view this payslip");
    }
  }
}

/** Minimal payslip HTML (design token styling lands with the M2 frontend). */
function renderPayslipHtml(data: {
  empCode: string;
  name: string;
  gross: string;
  net: string;
  breakdown: PayslipBreakdown;
}): string {
  const line = (name: string, amount: string): string =>
    `<tr><td>${name}</td><td style="text-align:right">${formatMoney(amount)}</td></tr>`;
  const b = data.breakdown;
  const earnings = [line("Base", b.base), line("Overtime", b.ot), ...b.allowances.map((a) => line(a.name, a.amount))];
  const deductions = [
    line("Social Security", b.sso),
    line("Withholding Tax", b.tax),
    line("Cash Advance", b.advance),
    ...b.deductions.map((d) => line(d.name, d.amount)),
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:sans-serif;margin:40px}h1{font-size:18px}
    table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:4px 0}
    .total{font-weight:bold;border-top:1px solid #000}
    </style></head><body>
    <h1>Payslip — ${data.name} (${data.empCode})</h1>
    <h2>Earnings</h2><table>${earnings.join("")}
      <tr class="total"><td>Gross</td><td style="text-align:right">${formatMoney(data.gross)}</td></tr></table>
    <h2>Deductions</h2><table>${deductions.join("")}</table>
    <table><tr class="total"><td>Net Pay</td><td style="text-align:right">${formatMoney(data.net)}</td></tr></table>
    </body></html>`;
}
