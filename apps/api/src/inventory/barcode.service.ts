import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { BarcodePrintRequest } from "@erp/contracts";
import { QUEUES } from "../queue/queue.constants.js";

/** The job name the label worker handles on the `pdf` queue. */
export const BARCODE_LABEL_JOB = "barcode-label";

/** Payload enqueued for a barcode-label render. */
export interface BarcodeLabelJob {
  sku_ids: string[];
  lot_ids: string[];
}

/**
 * Barcode-label printing (task 5.11, design D9). Enqueues a render job on the `pdf` queue
 * and returns 202 `{ job_id }`; the `BarcodeLabelWorker` does the bwip-js → PDF → storage
 * work off the request path.
 */
@Injectable()
export class BarcodeService {
  constructor(@InjectQueue(QUEUES.pdf) private readonly queue: Queue) {}

  async print(input: BarcodePrintRequest): Promise<{ job_id: string }> {
    const job = await this.queue.add(BARCODE_LABEL_JOB, {
      sku_ids: input.sku_ids ?? [],
      lot_ids: input.lot_ids ?? [],
    } satisfies BarcodeLabelJob);
    return { job_id: String(job.id ?? "") };
  }
}
