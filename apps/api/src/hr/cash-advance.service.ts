import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { cashAdvance, type Db } from "@erp/db";
import type {
  CashAdvance,
  CreateCashAdvanceRequest,
  RepaymentPlan,
} from "@erp/contracts";
import { formatMoney, toDecimal } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { CompensationService } from "./compensation.service.js";
import { PayrollConfigService } from "./payroll-config.service.js";
import { HR_EVENTS, type CashAdvancePayload } from "./hr.events.js";
import { advanceCeiling, advanceRepayment } from "./payroll-math.js";
import { m } from "./hr.util.js";

/** An outstanding advance the payroll engine can pull a repayment from. */
export interface OutstandingAdvance {
  id: string;
  outstanding: string;
  plan: RepaymentPlan | null;
}

/**
 * Cash advances (task 4.4): SUBMITTED (ceiling-checked → 422) → APPROVED (super-admin only
 * → 403) → DISBURSED (`outstanding = amount`) → REPAYING → CLEARED. Payroll approval pulls
 * repayments via `outstandingFor`/`applyRepayment`. Emits `CashAdvanceApproved` /
 * `CashAdvanceDisbursed`.
 */
@Injectable()
export class CashAdvanceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly comp: CompensationService,
    private readonly config: PayrollConfigService,
    private readonly events: EventBusService,
  ) {}

  /** Submit a request — rejected 422 if it exceeds `ceiling_pct × current base salary`. */
  async create(input: CreateCashAdvanceRequest): Promise<CashAdvance> {
    const ex = currentExecutor(this.db);
    const base = await this.comp.currentBaseSalary(input.employee_id);
    if (base === null) {
      throw new BusinessRuleError("Employee has no salary on file for the advance ceiling");
    }
    const policy = await this.config.advancePolicy();
    const ceiling = advanceCeiling(base, policy.ceilingPct);
    if (toDecimal(input.amount).greaterThan(toDecimal(ceiling))) {
      throw new BusinessRuleError(
        `Cash advance ${input.amount} exceeds the ceiling ${ceiling}`,
      );
    }

    const [row] = await ex
      .insert(cashAdvance)
      .values({
        employeeId: input.employee_id,
        amount: formatMoney(input.amount),
        reason: input.reason ?? null,
        repaymentPlan: input.repayment_plan ?? null,
        outstanding: "0",
      })
      .returning({ id: cashAdvance.id });
    if (!row) throw new StateConflictError("Cash advance could not be created");
    return this.load(row.id);
  }

  /** Approve a submitted advance — Super-Admin only (spec §2.4). */
  async approve(id: string, actor: AuthUser): Promise<CashAdvance> {
    if (!actor.isSuperAdmin) {
      throw new ForbiddenError("Only a super-admin may approve a cash advance");
    }
    const ex = currentExecutor(this.db);
    const current = await this.load(id);
    if (current.status !== "SUBMITTED") {
      throw new StateConflictError(`Cannot approve a ${current.status} cash advance`);
    }
    await ex
      .update(cashAdvance)
      .set({
        status: "APPROVED",
        approverId: actor.id,
        version: sql`${cashAdvance.version} + 1`,
      })
      .where(eq(cashAdvance.id, id));

    this.events.publishAfterCommit(
      makeEvent<CashAdvancePayload>({
        event: HR_EVENTS.cashAdvanceApproved,
        actorUserId: actor.id,
        payload: { cash_advance_id: id, employee_id: current.employee_id, amount: current.amount },
      }),
    );
    return this.load(id);
  }

  /** Disburse an approved advance — sets `outstanding = amount`. */
  async disburse(id: string, actor: AuthUser): Promise<CashAdvance> {
    const ex = currentExecutor(this.db);
    const current = await this.load(id);
    if (current.status !== "APPROVED") {
      throw new StateConflictError(`Cannot disburse a ${current.status} cash advance`);
    }
    await ex
      .update(cashAdvance)
      .set({
        status: "DISBURSED",
        outstanding: current.amount,
        version: sql`${cashAdvance.version} + 1`,
      })
      .where(eq(cashAdvance.id, id));

    this.events.publishAfterCommit(
      makeEvent<CashAdvancePayload>({
        event: HR_EVENTS.cashAdvanceDisbursed,
        actorUserId: actor.id,
        payload: { cash_advance_id: id, employee_id: current.employee_id, amount: current.amount },
      }),
    );
    return this.load(id);
  }

  /** Advances with a positive outstanding balance for an employee (DISBURSED/REPAYING). */
  async outstandingFor(employeeId: string): Promise<OutstandingAdvance[]> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select()
      .from(cashAdvance)
      .where(
        and(
          eq(cashAdvance.employeeId, employeeId),
          inArray(cashAdvance.status, ["DISBURSED", "REPAYING"]),
          gt(cashAdvance.outstanding, "0"),
        ),
      )
      .orderBy(cashAdvance.id);
    return rows.map((r) => ({
      id: r.id,
      outstanding: r.outstanding,
      plan: (r.repaymentPlan as RepaymentPlan | null) ?? null,
    }));
  }

  /**
   * Pull one period's repayment from an advance. Returns the amount actually pulled and
   * decrements `outstanding` (→ CLEARED at zero, else REPAYING). Runs inside the caller's
   * payroll-approval transaction.
   */
  async applyRepayment(advance: OutstandingAdvance): Promise<string> {
    const ex = currentExecutor(this.db);
    const pull = advanceRepayment(advance.outstanding, advance.plan);
    const remaining = formatMoney(
      toDecimal(advance.outstanding).minus(toDecimal(pull)),
    );
    const cleared = toDecimal(remaining).lessThanOrEqualTo(0);
    await ex
      .update(cashAdvance)
      .set({
        outstanding: cleared ? "0" : remaining,
        status: cleared ? "CLEARED" : "REPAYING",
        version: sql`${cashAdvance.version} + 1`,
      })
      .where(eq(cashAdvance.id, advance.id));
    return pull;
  }

  private async load(id: string): Promise<CashAdvance> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(cashAdvance)
      .where(eq(cashAdvance.id, id))
      .limit(1);
    if (!row) throw new NotFoundError("Cash advance not found");
    return {
      id: row.id,
      employee_id: row.employeeId,
      amount: m(row.amount),
      reason: row.reason,
      status: row.status,
      approver_id: row.approverId,
      repayment_plan: (row.repaymentPlan as RepaymentPlan | null) ?? null,
      outstanding: m(row.outstanding),
      version: row.version,
    };
  }
}
