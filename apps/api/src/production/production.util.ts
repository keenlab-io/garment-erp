import type { workOrder, workOrderStep } from "@erp/db";
import {
  asQty,
  type Defect as DefectDto,
  type Subcontract as SubcontractDto,
  type WorkOrder as WorkOrderDto,
  type WorkOrderStep as WorkOrderStepDto,
} from "@erp/contracts";
import { formatQty } from "@erp/utils";

type WorkOrderRow = typeof workOrder.$inferSelect;
type WorkOrderStepRow = typeof workOrderStep.$inferSelect;

/** Milliseconds in one minute — the standard-time unit is minutes. */
const MS_PER_MIN = 60_000;

/**
 * Elapsed minutes a step has been (or was) worked: `started_at` → `finished_at`, or → `now`
 * if still running. Returns `null` when the step has not started (nothing to compare against
 * its standard time). Never negative.
 */
export function actualMinutes(
  step: Pick<WorkOrderStepRow, "startedAt" | "finishedAt">,
  now: Date,
): number | null {
  if (!step.startedAt) return null;
  const end = step.finishedAt ?? now;
  return Math.max(0, (end.getTime() - step.startedAt.getTime()) / MS_PER_MIN);
}

/**
 * A step is delayed when its actual worked time exceeds `standard_time_min` (design D4).
 * Computed on read from the step's own snapshotted standard — a step that never started is
 * not delayed.
 */
export function isStepDelayed(
  step: Pick<WorkOrderStepRow, "startedAt" | "finishedAt" | "standardTimeMin">,
  now: Date,
): boolean {
  const actual = actualMinutes(step, now);
  return actual !== null && actual > step.standardTimeMin;
}

/** Map a `work_order_step` row to its contract shape, computing `is_delayed` on read. */
export function toStepDto(row: WorkOrderStepRow, now: Date): WorkOrderStepDto {
  return {
    id: row.id,
    wo_id: row.woId,
    routing_step_id: row.routingStepId,
    seq: row.seq,
    name: row.name,
    status: row.status,
    standard_time_min: row.standardTimeMin,
    started_at: row.startedAt ? row.startedAt.toISOString() : null,
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    assigned_to: row.assignedTo,
    machine: row.machine,
    is_delayed: isStepDelayed(row, now),
  };
}

/** Map a `work_order` row to its contract shape. */
export function toWorkOrderDto(row: WorkOrderRow): WorkOrderDto {
  return {
    id: row.id,
    wo_no: row.woNo,
    customer_id: row.customerId,
    finished_item_id: row.finishedItemId,
    qty: asQty(formatQty(row.qty)),
    due_date: row.dueDate,
    routing_template_id: row.routingTemplateId,
    machine: row.machine,
    mockup_file_key: row.mockupFileKey,
    status: row.status,
    version: row.version,
  };
}

/** Map a `defect` row to its contract shape. */
export function toDefectDto(row: {
  id: string;
  woStepId: string;
  type: string;
  qty: string;
  note: string | null;
}): DefectDto {
  return {
    id: row.id,
    wo_step_id: row.woStepId,
    type: row.type,
    qty: asQty(formatQty(row.qty)),
    note: row.note,
  };
}

/** Map a `subcontract` row to its contract shape. */
export function toSubcontractDto(row: {
  id: string;
  woStepId: string;
  vendor: string;
  slaDue: Date | null;
  status: SubcontractDto["status"];
}): SubcontractDto {
  return {
    id: row.id,
    wo_step_id: row.woStepId,
    vendor: row.vendor,
    sla_due: row.slaDue ? row.slaDue.toISOString() : null,
    status: row.status,
  };
}
