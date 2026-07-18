import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { and, desc, eq, sql } from "drizzle-orm";
import { notDeleted, reportSchedule, type Db } from "@erp/db";
import { tryDecodeCursor } from "@erp/utils";
import type {
  CreateReportScheduleRequest,
  ReportSchedule,
  ReportSchedulesQuery,
  UpdateReportScheduleRequest,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { assertVersion } from "../common/concurrency/if-match.js";
import { NotFoundError, StateConflictError } from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor, onCommit } from "../db/tx-context.js";
import { QUEUES } from "../queue/queue.constants.js";
import { scheduleSchedulerId, toScheduleDto } from "./schedule.util.js";

/** `report`-queue job name for a digest render (repeatable cron + `run-now` one-off). */
export const REPORT_DIGEST_JOB = "reporting.digest";

interface ScheduleCursor {
  createdAt: string;
  id: string;
}

/**
 * Report-schedule CRUD + repeatable-job lifecycle (task 4.4, design D8). The `report_schedule`
 * table is the source of truth: creating/updating/activating a schedule **upserts** its BullMQ
 * job scheduler (`repeat: { pattern: cron }`); deactivating/deleting **removes** it. All
 * scheduler mutations run on the after-commit hook so a rolled-back write never leaves an
 * orphaned repeatable job. `run-now` enqueues a one-off digest → 202.
 */
@Injectable()
export class ReportScheduleService {
  private readonly logger = new Logger(ReportScheduleService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.report) private readonly queue: Queue,
  ) {}

  async list(
    query: ReportSchedulesQuery,
  ): Promise<{ data: ReportSchedule[]; next_cursor: string | null }> {
    const ex = currentExecutor(this.db);
    const decoded = query.cursor
      ? (tryDecodeCursor(query.cursor) as ScheduleCursor | null)
      : null;
    const filters = [
      notDeleted(reportSchedule.deletedAt),
      decoded
        ? sql`(${reportSchedule.createdAt}, ${reportSchedule.id}) < (${new Date(decoded.createdAt)}, ${decoded.id})`
        : undefined,
    ].filter(Boolean);

    const rows = await ex
      .select()
      .from(reportSchedule)
      .where(and(...filters))
      .orderBy(desc(reportSchedule.createdAt), desc(reportSchedule.id))
      .limit(query.limit + 1);

    const page = buildPage(rows, query.limit, (r) => ({
      createdAt: r.createdAt.toISOString(),
      id: r.id,
    }));
    return { data: page.data.map(toScheduleDto), next_cursor: page.next_cursor };
  }

  async create(input: CreateReportScheduleRequest, actor: AuthUser): Promise<ReportSchedule> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .insert(reportSchedule)
      .values({
        name: input.name,
        reportKey: input.report_key,
        cron: input.cron,
        recipients: input.recipients,
        format: input.format,
        params: input.params,
        isActive: input.is_active,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    if (!row) throw new StateConflictError("Report schedule could not be created");
    this.reconcileScheduler(row.id, row.cron, row.isActive);
    return toScheduleDto(row);
  }

  async update(
    id: string,
    expectedVersion: number | null,
    input: UpdateReportScheduleRequest,
    actor: AuthUser,
  ): Promise<ReportSchedule> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(reportSchedule)
      .where(and(eq(reportSchedule.id, id), notDeleted(reportSchedule.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError(`Report schedule not found: ${id}`);
    if (expectedVersion !== null) assertVersion(row.version, expectedVersion);

    const [updated] = await ex
      .update(reportSchedule)
      .set({
        name: input.name ?? row.name,
        reportKey: input.report_key ?? row.reportKey,
        cron: input.cron ?? row.cron,
        recipients: input.recipients ?? row.recipients,
        format: input.format ?? row.format,
        params: input.params ?? row.params,
        isActive: input.is_active ?? row.isActive,
        updatedBy: actor.id,
        updatedAt: new Date(),
        version: row.version + 1,
      })
      .where(eq(reportSchedule.id, id))
      .returning();
    if (!updated) throw new StateConflictError("Report schedule could not be updated");
    this.reconcileScheduler(updated.id, updated.cron, updated.isActive);
    return toScheduleDto(updated);
  }

  async remove(id: string): Promise<void> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .update(reportSchedule)
      .set({ deletedAt: new Date() })
      .where(and(eq(reportSchedule.id, id), notDeleted(reportSchedule.deletedAt)))
      .returning();
    if (!row) throw new NotFoundError(`Report schedule not found: ${id}`);
    this.removeScheduler(id);
  }

  /** Enqueue a one-off digest render-and-send; returns the job id for the 202 poll. */
  async runNow(id: string): Promise<{ job_id: string }> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ id: reportSchedule.id })
      .from(reportSchedule)
      .where(and(eq(reportSchedule.id, id), notDeleted(reportSchedule.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError(`Report schedule not found: ${id}`);
    const job = await this.queue.add(REPORT_DIGEST_JOB, { schedule_id: id });
    return { job_id: String(job.id ?? "") };
  }

  /** Upsert the repeatable job when active, else remove it — after the write commits. */
  private reconcileScheduler(id: string, cron: string, isActive: boolean): void {
    if (isActive) {
      onCommit(async () => {
        try {
          await this.queue.upsertJobScheduler(
            scheduleSchedulerId(id),
            { pattern: cron },
            { name: REPORT_DIGEST_JOB, data: { schedule_id: id } },
          );
        } catch (err) {
          this.logger.warn(`Could not upsert schedule ${id}: ${String(err)}`);
        }
      });
    } else {
      this.removeScheduler(id);
    }
  }

  private removeScheduler(id: string): void {
    onCommit(async () => {
      try {
        await this.queue.removeJobScheduler(scheduleSchedulerId(id));
      } catch (err) {
        this.logger.warn(`Could not remove schedule ${id}: ${String(err)}`);
      }
    });
  }
}
