import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { attendance, otRequest, type Db } from "@erp/db";
import type {
  CreateOtRequest,
  OtRequest,
  OtRequestsQuery,
  ReconcileOtRequest,
} from "@erp/contracts";
import { formatQty, toDecimal } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import { NotFoundError, StateConflictError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { HR_EVENTS, type OtApprovedPayload } from "./hr.events.js";
import { approvedHours, hoursBetween } from "./payroll-math.js";
import { qN } from "./hr.util.js";

/**
 * Overtime lifecycle (task 4.3): DRAFT → SUBMITTED → APPROVED → RECONCILED. Reconcile
 * fixes `approved_hours = min(requested, attended)` — requested from the request window,
 * attended from the day's `attendance` row — unless an explicit override is supplied. The
 * OT pay itself (`approved_hours × hourly_rate × multiplier`) is realised by the payroll
 * engine; here we only clamp the hours. Emits `OTApproved`.
 */
@Injectable()
export class OtService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly events: EventBusService,
  ) {}

  /** List OT requests (optional status/employee filters — the approval queue). */
  async list(query: OtRequestsQuery): Promise<OtRequest[]> {
    const ex = currentExecutor(this.db);
    const filters = [
      query["filter[status]"] ? eq(otRequest.status, query["filter[status]"]) : undefined,
      query["filter[employee_id]"]
        ? eq(otRequest.employeeId, query["filter[employee_id]"])
        : undefined,
    ].filter(Boolean);
    const rows = await ex
      .select()
      .from(otRequest)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(otRequest.workDate));
    return rows.map((row) => ({
      id: row.id,
      employee_id: row.employeeId,
      work_date: row.workDate,
      start_time: row.startTime,
      end_time: row.endTime,
      reason: row.reason,
      rate_type: row.rateType,
      approved_hours: qN(row.approvedHours),
      status: row.status,
      approver_id: row.approverId,
      version: row.version,
    }));
  }

  async create(input: CreateOtRequest): Promise<OtRequest> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .insert(otRequest)
      .values({
        employeeId: input.employee_id,
        workDate: input.work_date,
        startTime: input.start_time,
        endTime: input.end_time,
        reason: input.reason ?? null,
        rateType: input.rate_type,
      })
      .returning({ id: otRequest.id });
    if (!row) throw new StateConflictError("OT request could not be created");
    return this.load(row.id);
  }

  async submit(id: string): Promise<OtRequest> {
    return this.transition(id, "DRAFT", "SUBMITTED");
  }

  async approve(id: string, actor: AuthUser): Promise<OtRequest> {
    const ex = currentExecutor(this.db);
    const current = await this.load(id);
    if (current.status !== "SUBMITTED") {
      throw new StateConflictError(`Cannot approve a ${current.status} OT request`);
    }
    await ex
      .update(otRequest)
      .set({
        status: "APPROVED",
        approverId: actor.id,
        version: sql`${otRequest.version} + 1`,
      })
      .where(eq(otRequest.id, id));

    this.events.publishAfterCommit(
      makeEvent<OtApprovedPayload>({
        event: HR_EVENTS.otApproved,
        actorUserId: actor.id,
        payload: { ot_request_id: id, employee_id: current.employee_id },
      }),
    );
    return this.load(id);
  }

  /** Clamp approved hours to min(requested, attended); an override in the body wins. */
  async reconcile(id: string, body: ReconcileOtRequest): Promise<OtRequest> {
    const ex = currentExecutor(this.db);
    const current = await this.load(id);
    if (current.status !== "APPROVED") {
      throw new StateConflictError(`Cannot reconcile a ${current.status} OT request`);
    }

    const requested = hoursBetween(current.start_time, current.end_time);
    const attended = await this.attendedHours(current.employee_id, current.work_date);
    const hours = approvedHours(requested, attended, body.approved_hours);

    await ex
      .update(otRequest)
      .set({
        status: "RECONCILED",
        approvedHours: hours,
        version: sql`${otRequest.version} + 1`,
      })
      .where(eq(otRequest.id, id));
    return this.load(id);
  }

  /** Attended hours for a day from the attendance clock in/out (0 when absent/incomplete). */
  private async attendedHours(employeeId: string, workDate: string): Promise<string> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ clockIn: attendance.clockIn, clockOut: attendance.clockOut })
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeId),
          eq(attendance.workDate, workDate),
        ),
      )
      .limit(1);
    if (!row?.clockIn || !row.clockOut) return "0";
    const ms = row.clockOut.getTime() - row.clockIn.getTime();
    if (ms <= 0) return "0";
    return formatQty(toDecimal(String(ms)).dividedBy(3_600_000));
  }

  private async transition(
    id: string,
    from: OtRequest["status"],
    to: OtRequest["status"],
  ): Promise<OtRequest> {
    const ex = currentExecutor(this.db);
    const current = await this.load(id);
    if (current.status !== from) {
      throw new StateConflictError(
        `Cannot move a ${current.status} OT request to ${to}`,
      );
    }
    await ex
      .update(otRequest)
      .set({ status: to, version: sql`${otRequest.version} + 1` })
      .where(eq(otRequest.id, id));
    return this.load(id);
  }

  private async load(id: string): Promise<OtRequest> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(otRequest)
      .where(eq(otRequest.id, id))
      .limit(1);
    if (!row) throw new NotFoundError("OT request not found");
    return {
      id: row.id,
      employee_id: row.employeeId,
      work_date: row.workDate,
      start_time: row.startTime,
      end_time: row.endTime,
      reason: row.reason,
      rate_type: row.rateType,
      approved_hours: qN(row.approvedHours),
      status: row.status,
      approver_id: row.approverId,
      version: row.version,
    };
  }
}
