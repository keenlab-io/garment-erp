import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lte } from "drizzle-orm";
import {
  employeePayComponent,
  payComponent,
  salaryRecord,
  type Db,
} from "@erp/db";
import type { CreateSalaryRequest, SalaryRecord } from "@erp/contracts";
import { formatMoney } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import type { PayLine } from "./payroll-math.js";
import { m, today } from "./hr.util.js";

/**
 * Salary history & pay components (task 4.2). The current base salary is the salary_record
 * with the latest `effective_date <= today`. Pay components assigned to an employee resolve
 * into allowance/deduction lines for the payroll engine (override amount over the
 * catalog default).
 */
@Injectable()
export class CompensationService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Append a salary record; the latest effective row becomes the current base salary. */
  async addSalaryRecord(
    employeeId: string,
    input: CreateSalaryRequest,
    actor: AuthUser,
  ): Promise<SalaryRecord> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .insert(salaryRecord)
      .values({
        employeeId,
        baseSalary: formatMoney(input.base_salary),
        effectiveDate: input.effective_date,
        createdBy: actor.id,
      })
      .returning();
    if (!row) throw new NotFoundError("Salary record could not be created");
    return {
      id: row.id,
      employee_id: row.employeeId,
      base_salary: m(row.baseSalary),
      effective_date: row.effectiveDate,
    };
  }

  /** Current base salary (latest effective ≤ asOf), or null when none is on file. */
  async currentBaseSalary(
    employeeId: string,
    asOf: string = today(),
  ): Promise<string | null> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ baseSalary: salaryRecord.baseSalary })
      .from(salaryRecord)
      .where(
        and(
          eq(salaryRecord.employeeId, employeeId),
          lte(salaryRecord.effectiveDate, asOf),
        ),
      )
      .orderBy(desc(salaryRecord.effectiveDate))
      .limit(1);
    return row ? row.baseSalary : null;
  }

  /**
   * Resolve an employee's assigned pay components into allowance/deduction lines. The
   * per-employee override `amount` wins over the catalog `default_amount`.
   */
  async resolveComponents(
    employeeId: string,
  ): Promise<{ allowances: PayLine[]; deductions: PayLine[] }> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select({
        name: payComponent.name,
        type: payComponent.type,
        amount: employeePayComponent.amount,
      })
      .from(employeePayComponent)
      .innerJoin(
        payComponent,
        eq(employeePayComponent.payComponentId, payComponent.id),
      )
      .where(eq(employeePayComponent.employeeId, employeeId));

    const allowances: PayLine[] = [];
    const deductions: PayLine[] = [];
    for (const row of rows) {
      const line = { name: row.name, amount: formatMoney(row.amount) };
      if (row.type === "ALLOWANCE") allowances.push(line);
      else deductions.push(line);
    }
    return { allowances, deductions };
  }
}
