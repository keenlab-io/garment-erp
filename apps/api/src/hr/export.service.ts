import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { and, eq } from "drizzle-orm";
import { employee, payrollRun, payslip, type Db } from "@erp/db";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { StorageService } from "../storage/storage.service.js";
import { QUEUES } from "../queue/queue.constants.js";
import type { PayslipBreakdown } from "./payroll-math.js";

/** Kind of statutory export and the job the payroll worker consumes. */
export type ExportKind = "pnd1" | "sso";
export const PAYROLL_EXPORT_JOB = "payroll.export";
export interface PayrollExportJob {
  kind: ExportKind;
  period: string;
}

/**
 * Statutory export inputs (task 4.8). PND.1 (withholding tax) and SSO (social security)
 * exports run as async jobs and land a CSV in object storage. They are **non-authoritative**
 * inputs — not filings — pending the confirmed Revenue-Department / SSO layouts (design OQ2).
 */
@Injectable()
export class ExportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.payroll) private readonly queue: Queue,
    private readonly storage: StorageService,
  ) {}

  /** Enqueue an export job; returns the job id for the 202-poll. */
  async enqueue(kind: ExportKind, period: string): Promise<{ job_id: string }> {
    const job = await this.queue.add(PAYROLL_EXPORT_JOB, {
      kind,
      period,
    } satisfies PayrollExportJob);
    return { job_id: String(job.id ?? "") };
  }

  /** Build the CSV for a period and store it; returns the object key. Called by the worker. */
  async run(kind: ExportKind, period: string): Promise<string> {
    const ex = currentExecutor(this.db);
    const [run] = await ex
      .select({ id: payrollRun.id })
      .from(payrollRun)
      .where(eq(payrollRun.period, period))
      .limit(1);
    if (!run) throw new NotFoundError(`No payroll run for period ${period}`);

    const rows = await ex
      .select({
        empCode: employee.empCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        breakdown: payslip.breakdown,
        gross: payslip.gross,
      })
      .from(payslip)
      .innerJoin(employee, eq(payslip.employeeId, employee.id))
      .where(and(eq(payslip.runId, run.id)))
      .orderBy(employee.empCode);

    const header =
      kind === "pnd1"
        ? "emp_code,name,gross,withholding_tax"
        : "emp_code,name,gross,sso_contribution";
    const lines = rows.map((r) => {
      const b = r.breakdown as PayslipBreakdown;
      const value = kind === "pnd1" ? b.tax : b.sso;
      const name = `${r.firstName} ${r.lastName}`.replace(/,/g, " ");
      return `${r.empCode},${name},${r.gross},${value}`;
    });
    const csv = [header, ...lines].join("\n");

    const key = `exports/${kind}/${period}.csv`;
    await this.storage.put(key, csv, "text/csv");
    return key;
  }
}
