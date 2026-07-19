import type { SubcontractStatus, WorkOrderStatus, WorkOrderStepStatus } from "@erp/contracts";
import type { ChipStatus } from "@erp/ui";

/**
 * Bridges the `production` module's state-machine enums to `InkChip`'s `ChipStatus` (M4 §3,
 * mirrors `hr/chip-status.ts`). `WorkOrderStepStatus`/`InkChipStatus` line up almost 1:1 (the
 * tokenized production-status set was designed for this module) except `DEFECT`, which has no
 * dedicated chip token and reuses the danger `overdue` semantic with an overridden label.
 */
const WORK_ORDER_STATUS_CHIP: Record<WorkOrderStatus, ChipStatus> = {
  PENDING: "pending",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  CANCELLED: "void",
};

export function workOrderStatusToChip(status: WorkOrderStatus): ChipStatus {
  return WORK_ORDER_STATUS_CHIP[status];
}

const WORK_ORDER_STEP_STATUS_CHIP: Record<WorkOrderStepStatus, ChipStatus> = {
  PENDING: "pending",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  HOLD: "hold",
  DEFECT: "overdue",
  OUTSOURCED: "outsourced",
};

/**
 * A step's status dot/bar (design MD1's legend: "○Pending ◐InProgress ●Completed ▲Delayed ❙❙Hold
 * ↗Sub"). `isDelayed` (computed server-side from elapsed vs standard time) wins over the raw
 * status — a step can be `IN_PROGRESS` *and* delayed, and the delayed dot is what the alert rail
 * and a passing supervisor need to see.
 */
export function workOrderStepStatusToChip(status: WorkOrderStepStatus, isDelayed: boolean): ChipStatus {
  if (isDelayed) return "delayed";
  return WORK_ORDER_STEP_STATUS_CHIP[status];
}

const SUBCONTRACT_STATUS_CHIP: Record<SubcontractStatus, ChipStatus> = {
  SENT: "pending",
  OVERDUE: "overdue",
  RECEIVED: "completed",
};

export function subcontractStatusToChip(status: SubcontractStatus): ChipStatus {
  return SUBCONTRACT_STATUS_CHIP[status];
}
