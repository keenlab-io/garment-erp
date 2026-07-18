import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { invoice, type Db } from "@erp/db";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { QUEUES } from "../queue/queue.constants.js";
import { StorageService } from "../storage/storage.service.js";

export const SALES_ETAX_JOB = "sales.etax-submit";

export interface SalesEtaxJob {
  invoice_id: string;
}

/**
 * e-Tax submission (task 5.10, design D12). `POST /etax/{invoice_id}/submit` enqueues a
 * `pdf`-queue job → 202 `{ job_id }`; the worker builds a **non-authoritative** RD e-Tax XML
 * document (stub layout, mirroring M2's PND.1 treatment) and lands it in object storage. This
 * is not a real Revenue-Department filing — the confirmed XSD is pending (design OQ).
 */
@Injectable()
export class EtaxService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.pdf) private readonly queue: Queue,
    private readonly storage: StorageService,
  ) {}

  /** Enqueue an e-Tax submission; returns the job id for the 202 poll. */
  async submit(invoiceId: string): Promise<{ job_id: string }> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ id: invoice.id })
      .from(invoice)
      .where(eq(invoice.id, invoiceId))
      .limit(1);
    if (!row) throw new NotFoundError(`Invoice not found: ${invoiceId}`);
    const job = await this.queue.add(SALES_ETAX_JOB, {
      invoice_id: invoiceId,
    } satisfies SalesEtaxJob);
    return { job_id: String(job.id ?? "") };
  }

  /** Build + store the (non-authoritative) e-Tax XML; returns the object key. */
  async run(invoiceId: string): Promise<string> {
    const ex = currentExecutor(this.db);
    const [inv] = await ex.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
    if (!inv) throw new NotFoundError(`Invoice not found: ${invoiceId}`);

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!-- NON-AUTHORITATIVE e-Tax stub; not a Revenue Department filing -->\n` +
      `<TaxInvoice>\n` +
      `  <DocumentNo>${inv.docNo}</DocumentNo>\n` +
      `  <Subtotal>${inv.subtotal}</Subtotal>\n` +
      `  <Vat>${inv.vatAmount}</Vat>\n` +
      `  <GrandTotal>${inv.grandTotal}</GrandTotal>\n` +
      `</TaxInvoice>\n`;

    const key = `etax/${inv.docNo}.xml`;
    await this.storage.put(key, xml, "application/xml");
    return key;
  }
}
