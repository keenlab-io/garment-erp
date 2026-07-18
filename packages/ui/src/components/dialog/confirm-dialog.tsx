import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog.js";
import { Button } from "../button/button.js";
import { FormField } from "../form-field/form-field.js";
import { Input } from "../input/input.js";

export interface ConfirmResult {
  reason?: string;
  password?: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Explicit consequence text naming the affected record, e.g. "This voids invoice QV20260042…". */
  consequence: React.ReactNode;
  /** Called with the captured reason / password when the user confirms. */
  onConfirm: (result: ConfirmResult) => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Weight the confirm action as destructive (red). */
  destructive?: boolean;
  /** Require a typed reason; a blank reason blocks the submit with an inline error. */
  requireReason?: boolean;
  reasonLabel?: React.ReactNode;
  /** Require a super-admin password (re-auth); confirm stays disabled until it is entered. */
  requirePassword?: boolean;
  passwordLabel?: React.ReactNode;
  /** Disable actions while the confirm is in flight. */
  loading?: boolean;
  /**
   * Extra condition that disables the confirm button regardless of reason/password state — the
   * defense-in-depth half of a guarded action's permission gate (the trigger control is the other
   * half; see `GuardedActionDialog`).
   */
  confirmDisabled?: boolean;
}

/**
 * A confirmation dialog for consequential actions. It states the exact consequence and the affected
 * record id, and can capture a required reason (blank blocks submit) and/or a re-auth password for
 * super-admin-guarded actions (confirm disabled until entered). Destructive actions are weighted red.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  requireReason = false,
  reasonLabel = "Reason",
  requirePassword = false,
  passwordLabel = "Super-Admin password",
  loading = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string>();

  // Reset the captured fields whenever the dialog reopens.
  React.useEffect(() => {
    if (open) {
      setReason("");
      setPassword("");
      setReasonError(undefined);
    }
  }, [open]);

  const passwordMissing = requirePassword && password.trim() === "";

  const handleConfirm = async () => {
    if (requireReason && reason.trim() === "") {
      setReasonError("A reason is required.");
      return;
    }
    await onConfirm({
      reason: requireReason ? reason : undefined,
      password: requirePassword ? password : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={!loading}>
        <DialogHeader>
          <DialogTitle
            className={cn(
              "flex items-center gap-2 text-h3 font-semibold text-text-primary",
              destructive && "text-danger",
            )}
          >
            {destructive && <AlertTriangle className="size-5 shrink-0" aria-hidden />}
            {title}
          </DialogTitle>
          <p className="text-sm text-text-secondary">{consequence}</p>
        </DialogHeader>

        {requireReason && (
          <FormField label={reasonLabel} required error={reasonError}>
            <Input
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(undefined);
              }}
              placeholder="Explain why"
            />
          </FormField>
        )}

        {requirePassword && (
          <FormField label={passwordLabel} required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Re-enter to authorize"
            />
          </FormField>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={handleConfirm}
            disabled={passwordMissing || confirmDisabled}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
