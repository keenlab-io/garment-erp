import { Inject } from "@nestjs/common";
import { Processor } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { inArray } from "drizzle-orm";
import * as bwipjs from "bwip-js/node";
import { sku, stockLot, type Db } from "@erp/db";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { PdfService } from "../pdf/pdf.service.js";
import { StorageService } from "../storage/storage.service.js";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { BARCODE_LABEL_JOB, type BarcodeLabelJob } from "./barcode.service.js";

/** One label to render — a code and its human-readable caption. */
interface Label {
  code: string;
  caption: string;
}

/**
 * Renders barcode-label PDFs on the `pdf` queue (design D9). For each SKU/lot it draws the
 * barcode with bwip-js (Code128, pure-JS), embeds it as a PNG data-URI in a label HTML
 * template, renders the sheet via `PdfService`, and stores it via `StorageService`. Keyed
 * on `job.id` so re-runs overwrite rather than duplicate.
 */
@Processor(QUEUES.pdf)
export class BarcodeLabelWorker extends BaseWorker<BarcodeLabelJob, { key: string } | null> {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async handle(job: Job<BarcodeLabelJob>): Promise<{ key: string } | null> {
    if (job.name !== BARCODE_LABEL_JOB) return null;

    const labels = await this.collectLabels(job.data);
    const cells = await Promise.all(
      labels.map(async (label) => {
        const png = await bwipjs.toBuffer({
          bcid: "code128",
          text: label.code,
          scale: 3,
          height: 10,
          includetext: true,
          textxalign: "center",
        });
        const uri = `data:image/png;base64,${png.toString("base64")}`;
        return `<div class="label"><img src="${uri}" alt="${label.code}" /><div>${label.caption}</div></div>`;
      }),
    );

    const html = `<!doctype html><html><head><style>
      .label{display:inline-block;margin:8px;text-align:center;font-family:monospace}
      </style></head><body>${cells.join("")}</body></html>`;

    const pdf = await this.pdf.renderHtml(html);
    const key = `barcodes/${job.id ?? "label"}.pdf`;
    await this.storage.put(key, pdf, "application/pdf");
    return { key };
  }

  /** Resolve the SKU/lot ids into printable codes (falling back to the id). */
  private async collectLabels(data: BarcodeLabelJob): Promise<Label[]> {
    const ex = currentExecutor(this.db);
    const labels: Label[] = [];

    if (data.sku_ids.length > 0) {
      const rows = await ex
        .select({ id: sku.id, code: sku.skuCode, barcode: sku.barcode })
        .from(sku)
        .where(inArray(sku.id, data.sku_ids));
      for (const r of rows) {
        labels.push({ code: r.barcode ?? r.code, caption: r.code });
      }
    }
    if (data.lot_ids.length > 0) {
      const rows = await ex
        .select({ id: stockLot.id, no: stockLot.lotNo, barcode: stockLot.barcode })
        .from(stockLot)
        .where(inArray(stockLot.id, data.lot_ids));
      for (const r of rows) {
        labels.push({ code: r.barcode ?? r.no, caption: r.no });
      }
    }
    return labels;
  }
}
