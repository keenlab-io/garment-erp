import { Inject, type OnModuleInit } from "@nestjs/common";
import { InjectQueue, Processor } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Queue, type Job } from "bullmq";
import { and, eq, inArray, lt } from "drizzle-orm";
import { invoice, type Db } from "@erp/db";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { BaseWorker } from "../queue/base.worker.js";
import { QUEUES } from "../queue/queue.constants.js";
import { SALES_EVENTS, type InvoiceOverduePayload } from "./sales.events.js";
import { isoDate } from "./sales.util.js";

/** The repeatable overdue-sweep job on the `default` queue. */
export const SALES_OVERDUE_JOB = "sales.overdue.sweep";
const SALES_OVERDUE_SCHEDULER_ID = "sales-overdue-monitor";

/**
 * The overdue sweep (task 5.9, design D11). On module init it upserts a repeatable job on the
 * `default` queue (cadence `SALES_OVERDUE_SWEEP_MS`, default daily). Each tick, in one
 * transaction, it flips ISSUED / PARTIALLY_PAID invoices whose `due_date` is past to
 * **OVERDUE** and emits `InvoiceOverdue`. The upserted scheduler (single job key) means API
 * replicas don't stack duplicate schedulers.
 */
@Processor(QUEUES.default)
export class OverdueMonitorWorker
  extends BaseWorker<unknown, { ok: true }>
  implements OnModuleInit
{
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.default) private readonly queue: Queue,
    private readonly uow: UnitOfWork,
    private readonly config: ConfigService,
    private readonly events: EventBusService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const every = this.config.get<number>("SALES_OVERDUE_SWEEP_MS") ?? 86_400_000;
    try {
      await this.queue.add(
        SALES_OVERDUE_JOB,
        {},
        { repeat: { every }, jobId: SALES_OVERDUE_SCHEDULER_ID },
      );
    } catch (err) {
      this.logger.warn(`Could not register the sales overdue sweep: ${String(err)}`);
    }
  }

  async handle(job: Job): Promise<{ ok: true }> {
    if (job.name === SALES_OVERDUE_JOB) {
      await this.uow.withTransaction(() => this.sweep(new Date()));
    }
    return { ok: true };
  }

  /** One overdue pass at `now` (runs in the caller's tx). Returns the count flipped. */
  async sweep(now: Date): Promise<number> {
    const ex = currentExecutor(this.db);
    const overdue = await ex
      .select()
      .from(invoice)
      .where(
        and(
          inArray(invoice.status, ["ISSUED", "PARTIALLY_PAID"]),
          lt(invoice.dueDate, isoDate(now)),
        ),
      );

    for (const inv of overdue) {
      await ex
        .update(invoice)
        .set({ status: "OVERDUE" })
        .where(eq(invoice.id, inv.id));
      this.events.publishAfterCommit(
        makeEvent<InvoiceOverduePayload>({
          event: SALES_EVENTS.invoiceOverdue,
          payload: { invoice_id: inv.id, doc_no: inv.docNo, due_date: inv.dueDate },
        }),
      );
    }
    return overdue.length;
  }
}
