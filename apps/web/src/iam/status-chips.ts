import type { ChipStatus } from "@erp/ui";
import { UserStatus, AuditAction } from "@erp/contracts";

/**
 * Bridges IAM-domain statuses to the shared Ink-Chip catalog (MD4/FD4 — "never color alone").
 * Neither `UserStatus` nor `AuditAction` has a dedicated chip token, so each reuses the closest
 * existing swatch/glyph; the screen always overrides `InkChip`'s `label` with real copy.
 */
const USER_STATUS_TO_CHIP: Record<UserStatus, ChipStatus> = {
  [UserStatus.ACTIVE]: "completed",
  [UserStatus.PENDING]: "pending",
  [UserStatus.DISABLED]: "hold",
};

export function userStatusToChip(status: UserStatus): ChipStatus {
  return USER_STATUS_TO_CHIP[status];
}

const AUDIT_ACTION_TO_CHIP: Record<AuditAction, ChipStatus> = {
  [AuditAction.CREATE]: "completed",
  [AuditAction.UPDATE]: "in-progress",
  [AuditAction.DELETE]: "delayed",
  [AuditAction.LOGIN]: "outsourced",
  [AuditAction.LOGOUT]: "hold",
  [AuditAction.PERMISSION_CHANGE]: "partial",
  [AuditAction.FORCE_LOGOUT]: "overdue",
  [AuditAction.APPROVE]: "approved",
  [AuditAction.VOID]: "void",
};

export function auditActionToChip(action: string): ChipStatus {
  return AUDIT_ACTION_TO_CHIP[action as AuditAction] ?? "pending";
}
