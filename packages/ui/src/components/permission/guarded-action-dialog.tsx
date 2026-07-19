import * as React from "react";
import type { Permission } from "@erp/contracts";
import { ConfirmDialog, type ConfirmResult } from "../dialog/confirm-dialog.js";
import { usePermissions } from "./permissions-context.js";

export type GuardedActionKind =
  | "force-logout"
  | "role-delete"
  | "document-void"
  | "stock-adjustment"
  | "payroll-approve";

export interface GuardedActionPreset {
  /** The permission that must also gate the trigger control (defense in depth). */
  permission: Permission;
  requireReason: boolean;
  requirePassword: boolean;
  destructive: boolean;
  confirmLabel: string;
  title: (subject: string) => string;
  consequence: (subject: string) => string;
}

/**
 * The guarded-action presets the spec designates: force-logout, role delete, document void, stock
 * adjustment, and payroll approve. `requireReason`/`requirePassword` mirror what each action's
 * `@erp/contracts` request body actually demands (`VoidDocumentRequest.reason`,
 * `CreateStockAdjustmentRequest.reason`, `DeleteRoleRequest.super_admin_password`) — a super-admin
 * re-auth action requires a password, a reason-gated action requires a reason, never both here.
 */
export const GUARDED_ACTION_PRESETS: Record<GuardedActionKind, GuardedActionPreset> = {
  "force-logout": {
    permission: "iam.user.force_logout",
    requireReason: false,
    requirePassword: true,
    destructive: true,
    confirmLabel: "Force logout",
    title: (subject) => `Force logout ${subject}?`,
    consequence: (subject) => `This immediately revokes every active session for ${subject}.`,
  },
  "role-delete": {
    permission: "iam.role.manage",
    requireReason: false,
    requirePassword: true,
    destructive: true,
    confirmLabel: "Delete role",
    title: (subject) => `Delete role ${subject}?`,
    consequence: (subject) => `This permanently deletes the role ${subject}.`,
  },
  "document-void": {
    permission: "sales.document.void",
    requireReason: true,
    requirePassword: false,
    destructive: true,
    confirmLabel: "Void",
    title: (subject) => `Void ${subject}?`,
    consequence: (subject) => `This voids ${subject} and cannot be undone.`,
  },
  "stock-adjustment": {
    permission: "inventory.adjustment.approve",
    requireReason: true,
    requirePassword: false,
    destructive: false,
    confirmLabel: "Approve adjustment",
    title: (subject) => `Approve stock adjustment ${subject}?`,
    consequence: (subject) => `This posts adjustment ${subject}'s lines to on-hand stock.`,
  },
  "payroll-approve": {
    permission: "hr.payroll.approve",
    requireReason: false,
    requirePassword: false,
    destructive: false,
    confirmLabel: "Approve payroll",
    title: (subject) => `Approve payroll run ${subject}?`,
    consequence: (subject) =>
      `This locks payroll run ${subject}, pulls outstanding advances into deductions, and generates payslips.`,
  },
};

export interface GuardedActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which preset to apply. */
  kind: GuardedActionKind;
  /** The affected record id/name, interpolated into the title and consequence text. */
  subject: string;
  onConfirm: (result: ConfirmResult) => void | Promise<void>;
  loading?: boolean;
}

/**
 * Guarded-action confirmation flow (spec "Guarded-action confirmation flows"): opens the shared
 * `ConfirmDialog` pre-configured from a `GuardedActionPreset` — consequence text naming the subject,
 * a required reason where the backend requires one, a re-auth password where the action is
 * super-admin-only. The confirming control is permission-gated in addition to the trigger: if the
 * viewer somehow lacks the preset's permission while the dialog is open, confirm stays disabled.
 */
export function GuardedActionDialog({
  open,
  onOpenChange,
  kind,
  subject,
  onConfirm,
  loading = false,
}: GuardedActionDialogProps) {
  const { has } = usePermissions();
  const preset = GUARDED_ACTION_PRESETS[kind];
  const allowed = has(preset.permission);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={preset.title(subject)}
      consequence={preset.consequence(subject)}
      onConfirm={onConfirm}
      confirmLabel={preset.confirmLabel}
      destructive={preset.destructive}
      requireReason={preset.requireReason}
      requirePassword={preset.requirePassword}
      confirmDisabled={!allowed}
      loading={loading}
    />
  );
}
