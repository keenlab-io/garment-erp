import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { and, between, desc, eq, inArray, sql } from "drizzle-orm";
import {
  employee,
  otRequest,
  payrollRun,
  payslip,
  type Db,
} from "@erp/db";
import type {
  CreatePayrollRunRequest,
  PayrollRun,
  PayrollRunsQuery,
  PayslipSummary,
} from "@erp/contracts";
import { sumMoney } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import { NotFoundError, StateConflictError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { QUEUES } from "../queue/queue.constants.js";
import { CashAdvanceService } from "./cash-advance.service.js";
import { CompensationService } from "./compensation.service.js";
import { PayrollConfigService } from "./payroll-config.service.js";
import { PayslipService } from "./payslip.service.js";
import { HR_EVENTS, type PayrollApprovedPayload } from "./hr.events.js";
import {
  computeTotals,
  hourlyRate,
  monthlyTax,
  otPay,
  ssoContribution,
  type PayslipBreakdown,
} from "./payroll-math.js";
import { m, periodBounds } from "./hr.util.js";

/** The job the calculate worker consumes off the `payroll` queue. */
export const PAYROLL_CALCULATE_JOB = "payroll.calculate";
export interface PayrollCalculateJob {
  run_id: string;
  actor_user_id: string;
}

/**
 * Payroll run engine (task 4.6, design D4). `create` opens a DRAFT run for a unique period;
 * `calculate` enqueues an async job (the repo's first producer) returning 202 `{ job_id }`;
 * the worker calls `computeRun` to snapshot one immutable `payslip.breakdown` per active
 * employee with the net formula to the cent. `approve` pulls each employee's outstanding
 * advance into the deduction line, decrements `outstanding`, freezes the run, and is a
 * **409 on double-approve**. Recalculation is allowed only while DRAFT/CALCULATED.
 */
@Injectable()
export class PayrollService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.payroll) private readonly queue: Queue,
    private readonly comp: CompensationService,
    private readonly config: PayrollConfigService,
    private readonly advances: CashAdvanceService,
    private readonly payslips: PayslipService,
    private readonly events: EventBusService,
  ) {}

  /** List payroll runs, newest period first (optional status facet — the run-list screen). */
  async list(query: PayrollRunsQuery): Promise<PayrollRun[]> {
    const ex = currentExecutor(this.db);
    const filters = query["filter[status]"]
      ? [eq(payrollRun.status, query["filter[status]"])]
      : [];
    const rows = await ex
      .select()
      .from(payrollRun)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(payrollRun.period));
    return rows.map((row) => ({
      id: row.id,
      period: row.period,
      status: row.status,
      approved_by: row.approvedBy,
      version: row.version,
    }));
  }

  async create(input: CreatePayrollRunRequest): Promise<PayrollRun> {
    const ex = currentExecutor(this.db);
    // A duplicate `period` hits the UNIQUE constraint → the exception filter maps 23505 → 409.
    const [row] = await ex
      .insert(payrollRun)
      .values({ period: input.period })
      .returning({ id: payrollRun.id });
    if (!row) throw new StateConflictError("Payroll run could not be created");
    return this.load(row.id);
  }

  /** Enqueue calculation — allowed only while DRAFT/CALCULATED (APPROVED runs are frozen). */
  async calculate(id: string, actor: AuthUser): Promise<{ job_id: string }> {
    const run = await this.load(id);
    if (run.status !== "DRAFT" && run.status !== "CALCULATED") {
      throw new StateConflictError(`Cannot recalculate a ${run.status} run`);
    }
    const job = await this.queue.add(PAYROLL_CALCULATE_JOB, {
      run_id: id,
      actor_user_id: actor.id,
    } satisfies PayrollCalculateJob);
    return { job_id: String(job.id ?? "") };
  }

  /**
   * Build one payslip per active employee and snapshot the breakdown (advance line = 0;
   * advances are pulled at approval). Idempotent on `(run_id, employee_id)`. Runs inside
   * the worker's transaction.
   */
  async computeRun(runId: string): Promise<number> {
    const ex = currentExecutor(this.db);
    const run = await this.load(runId);
    const { start, end } = periodBounds(run.period);

    const brackets = await this.config.taxBrackets(end);
    const sso = await this.config.ssoConfig(end);

    const employees = await ex
      .select({
        id: employee.id,
        employmentType: employee.employmentType,
      })
      .from(employee)
      .where(inArray(employee.status, ["ACTIVE", "PROBATION"]));

    let count = 0;
    for (const emp of employees) {
      const base = (await this.comp.currentBaseSalary(emp.id, end)) ?? "0";
      const { allowances, deductions } = await this.comp.resolveComponents(emp.id);
      const ot = await this.periodOtPay(emp.id, base, emp.employmentType, start, end);

      const breakdown: PayslipBreakdown = {
        base,
        ot,
        allowances,
        sso: ssoContribution(base, sso),
        tax: monthlyTax(base, brackets),
        advance: "0",
        deductions,
      };
      const totals = computeTotals(breakdown);

      await ex
        .insert(payslip)
        .values({
          runId,
          employeeId: emp.id,
          breakdown,
          gross: totals.gross,
          net: totals.net,
        })
        .onConflictDoUpdate({
          target: [payslip.runId, payslip.employeeId],
          set: { breakdown, gross: totals.gross, net: totals.net, pdfKey: null },
        });
      count += 1;
    }

    await ex
      .update(payrollRun)
      .set({ status: "CALCULATED", version: sql`${payrollRun.version} + 1` })
      .where(eq(payrollRun.id, runId));
    return count;
  }

  async listPayslips(runId: string): Promise<PayslipSummary[]> {
    const ex = currentExecutor(this.db);
    await this.load(runId); // 404 if the run is unknown
    const rows = await ex
      .select({
        id: payslip.id,
        employeeId: payslip.employeeId,
        gross: payslip.gross,
        net: payslip.net,
      })
      .from(payslip)
      .where(eq(payslip.runId, runId))
      .orderBy(payslip.id);
    return rows.map((r) => ({
      id: r.id,
      employee_id: r.employeeId,
      gross: m(r.gross),
      net: m(r.net),
    }));
  }

  /**
   * Approve a calculated run: pull each employee's outstanding advance into the deduction
   * line, recompute net, decrement the advance (→ CLEARED at 0), freeze the run, and
   * enqueue payslip PDFs. A run not in CALCULATED (e.g. already APPROVED) → 409.
   */
  async approve(id: string, actor: AuthUser): Promise<PayrollRun> {
    const ex = currentExecutor(this.db);
    const run = await this.load(id);
    if (run.status !== "CALCULATED") {
      throw new StateConflictError(`Cannot approve a ${run.status} run`);
    }

    const slips = await ex
      .select({
        id: payslip.id,
        employeeId: payslip.employeeId,
        breakdown: payslip.breakdown,
      })
      .from(payslip)
      .where(eq(payslip.runId, id));

    for (const slip of slips) {
      const breakdown = slip.breakdown as PayslipBreakdown;
      const outstanding = await this.advances.outstandingFor(slip.employeeId);
      const pulls: string[] = [];
      for (const advance of outstanding) {
        pulls.push(await this.advances.applyRepayment(advance));
      }
      const advanceTotal = pulls.length > 0 ? sumMoney(pulls) : "0";

      const updated: PayslipBreakdown = { ...breakdown, advance: advanceTotal };
      const totals = computeTotals(updated);
      await ex
        .update(payslip)
        .set({ breakdown: updated, gross: totals.gross, net: totals.net })
        .where(eq(payslip.id, slip.id));

      this.payslips.enqueueGeneration(slip.id);
    }

    await ex
      .update(payrollRun)
      .set({
        status: "APPROVED",
        approvedBy: actor.id,
        version: sql`${payrollRun.version} + 1`,
      })
      .where(eq(payrollRun.id, id));

    this.events.publishAfterCommit(
      makeEvent<PayrollApprovedPayload>({
        event: HR_EVENTS.payrollApproved,
        actorUserId: actor.id,
        payload: { run_id: id, period: run.period, payslip_count: slips.length },
      }),
    );
    return this.load(id);
  }

  /** Sum OT pay for an employee's RECONCILED requests within the period. */
  private async periodOtPay(
    employeeId: string,
    base: string,
    employmentType: "MONTHLY" | "DAILY",
    start: string,
    end: string,
  ): Promise<string> {
    const ex = currentExecutor(this.db);
    const requests = await ex
      .select({
        approvedHours: otRequest.approvedHours,
        rateType: otRequest.rateType,
      })
      .from(otRequest)
      .where(
        and(
          eq(otRequest.employeeId, employeeId),
          eq(otRequest.status, "RECONCILED"),
          between(otRequest.workDate, start, end),
        ),
      );
    if (requests.length === 0) return "0";

    const hourly = hourlyRate(base, employmentType);
    const lines: string[] = [];
    for (const req of requests) {
      if (!req.approvedHours) continue;
      const multiplier = await this.config.otMultiplier(req.rateType, end);
      lines.push(otPay(req.approvedHours, hourly, multiplier));
    }
    return lines.length > 0 ? sumMoney(lines) : "0";
  }

  private async load(id: string): Promise<PayrollRun> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(payrollRun)
      .where(eq(payrollRun.id, id))
      .limit(1);
    if (!row) throw new NotFoundError("Payroll run not found");
    return {
      id: row.id,
      period: row.period,
      status: row.status,
      approved_by: row.approvedBy,
      version: row.version,
    };
  }
}
