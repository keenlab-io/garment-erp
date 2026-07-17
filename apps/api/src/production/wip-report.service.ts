import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { routingStep, workOrderStep, type Db } from "@erp/db";
import type { WipReportRow } from "@erp/contracts";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { isStepDelayed } from "./production.util.js";

/**
 * WIP / bottleneck report (task 4.7, design D9). Aggregates IN_PROGRESS work-order steps per
 * department (resolved from the materialized step's routing step) and, within each, how many
 * are delayed (`is_delayed` computed on read). Steps whose routing step has no department are
 * omitted — the report keys off department.
 */
@Injectable()
export class WipReportService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async report(): Promise<WipReportRow[]> {
    const ex = currentExecutor(this.db);
    const now = new Date();

    const rows = await ex
      .select({
        departmentId: routingStep.departmentId,
        startedAt: workOrderStep.startedAt,
        finishedAt: workOrderStep.finishedAt,
        standardTimeMin: workOrderStep.standardTimeMin,
      })
      .from(workOrderStep)
      .innerJoin(routingStep, eq(workOrderStep.routingStepId, routingStep.id))
      .where(eq(workOrderStep.status, "IN_PROGRESS"));

    const byDept = new Map<string, { in_progress: number; delayed: number }>();
    for (const r of rows) {
      if (!r.departmentId) continue;
      const agg = byDept.get(r.departmentId) ?? { in_progress: 0, delayed: 0 };
      agg.in_progress++;
      if (isStepDelayed(r, now)) agg.delayed++;
      byDept.set(r.departmentId, agg);
    }

    return [...byDept.entries()].map(([department_id, agg]) => ({
      department_id,
      in_progress_count: agg.in_progress,
      delayed_count: agg.delayed,
    }));
  }
}
