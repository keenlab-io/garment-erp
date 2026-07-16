import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { and, between, eq } from "drizzle-orm";
import { employee, type Db } from "@erp/db";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { QUEUES } from "../queue/queue.constants.js";
import { HR_EVENTS, type ProbationEndingPayload } from "./hr.events.js";
import { today } from "./hr.util.js";

/** The daily repeatable job that scans for ending probations. */
export const PROBATION_SCAN_JOB = "hr.probation.scan";
const PROBATION_SCHEDULER_ID = "hr-probation-daily";

/**
 * Probation-ending alerts (task 4.10, design D6). On module init this upserts a **daily
 * BullMQ repeatable job** (no `@nestjs/schedule` dependency — one job system). The worker
 * invokes `scan`, which emits `ProbationEnding` for every PROBATION employee whose
 * `probation_end_date` falls within `PROBATION_ALERT_DAYS`.
 */
@Injectable()
export class ProbationService implements OnModuleInit {
  private readonly logger = new Logger(ProbationService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.payroll) private readonly queue: Queue,
    private readonly config: ConfigService,
    private readonly events: EventBusService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Upserted (not re-added) so a restart never stacks duplicate schedulers.
      await this.queue.add(
        PROBATION_SCAN_JOB,
        {},
        {
          repeat: { pattern: "0 2 * * *" }, // daily at 02:00
          jobId: PROBATION_SCHEDULER_ID,
        },
      );
    } catch (err) {
      // Never block boot on the scheduler (e.g. Redis briefly unavailable in dev).
      this.logger.warn(`Could not register the probation scan job: ${String(err)}`);
    }
  }

  /** Emit `ProbationEnding` for probationers ending within the alert window. */
  async scan(): Promise<number> {
    const ex = currentExecutor(this.db);
    const days = this.config.get<number>("PROBATION_ALERT_DAYS") ?? 30;
    const from = today();
    const to = addDays(from, days);

    const rows = await ex
      .select({
        id: employee.id,
        empCode: employee.empCode,
        probationEndDate: employee.probationEndDate,
      })
      .from(employee)
      .where(
        and(
          eq(employee.status, "PROBATION"),
          between(employee.probationEndDate, from, to),
        ),
      );

    for (const row of rows) {
      if (!row.probationEndDate) continue;
      this.events.publishAfterCommit(
        makeEvent<ProbationEndingPayload>({
          event: HR_EVENTS.probationEnding,
          payload: {
            employee_id: row.id,
            emp_code: row.empCode,
            probation_end_date: row.probationEndDate,
          },
        }),
      );
    }
    return rows.length;
  }
}

/** Add whole days to a `YYYY-MM-DD` string, returning a `YYYY-MM-DD` string. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
