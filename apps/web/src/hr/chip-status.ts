import type { CashAdvanceStatus, PayrollRunStatus } from "@erp/contracts";
import type { ChipStatus } from "@erp/ui";

/**
 * Bridges the `hr` module's state-machine enums to `InkChip`'s `ChipStatus` (M2 §3, mirrors
 * `routingStatusToChip` in `@erp/ui`). No hr-specific chip tokens exist yet, so these reuse the
 * closest existing semantic/tokenized statuses rather than growing the shared `ChipStatus` union.
 */
const PAYROLL_RUN_STATUS_CHIP: Record<PayrollRunStatus, ChipStatus> = {
  DRAFT: "draft",
  CALCULATED: "in-progress",
  APPROVED: "approved",
  PAID: "paid",
  CLOSED: "posted",
};

export function payrollRunStatusToChip(status: PayrollRunStatus): ChipStatus {
  return PAYROLL_RUN_STATUS_CHIP[status];
}

const CASH_ADVANCE_STATUS_CHIP: Record<CashAdvanceStatus, ChipStatus> = {
  SUBMITTED: "pending",
  APPROVED: "approved",
  REJECTED: "void",
  DISBURSED: "paid",
  REPAYING: "partial",
  CLEARED: "posted",
};

export function cashAdvanceStatusToChip(status: CashAdvanceStatus): ChipStatus {
  return CASH_ADVANCE_STATUS_CHIP[status];
}
