import * as React from "react";
import type { Defect, WorkOrderStep } from "@erp/contracts";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  InkChip,
  Input,
  cn,
} from "@erp/ui";
import { workOrderStepStatusToChip } from "../chip-status.js";

/** A step's elapsed-vs-standard read (M4 §3.2) — pure so it's testable without a clock in render. */
export interface StepTiming {
  /** Minutes since `started_at`, to `finished_at` or `now` if still running. `null` if not started. */
  elapsedMin: number | null;
  standardMin: number;
  overStandard: boolean;
}

export function computeStepTiming(
  step: Pick<WorkOrderStep, "started_at" | "finished_at" | "standard_time_min">,
  now: Date = new Date(),
): StepTiming {
  if (!step.started_at) {
    return { elapsedMin: null, standardMin: step.standard_time_min, overStandard: false };
  }
  const startMs = new Date(step.started_at).getTime();
  const endMs = step.finished_at ? new Date(step.finished_at).getTime() : now.getTime();
  const elapsedMin = Math.max(0, Math.round((endMs - startMs) / 60_000));
  return {
    elapsedMin,
    standardMin: step.standard_time_min,
    overStandard: elapsedMin > step.standard_time_min,
  };
}

export interface StepDrawerLabels {
  assigned: string;
  unassigned: string;
  machine: string;
  noMachine: string;
  elapsed: string;
  standard: string;
  notStarted: string;
  minutes: string;
  defects: string;
  noDefects: string;
  hold: string;
  holdTitle: string;
  holdConsequence: string;
  subcontract: string;
  subcontractTitle: string;
  vendorLabel: string;
  slaDueLabel: string;
  reassign: string;
  assignedToLabel: string;
  cancel: string;
  send: string;
}

const defaultLabels: StepDrawerLabels = {
  assigned: "Assigned",
  unassigned: "Unassigned",
  machine: "Machine",
  noMachine: "—",
  elapsed: "Elapsed",
  standard: "Standard",
  notStarted: "Not started",
  minutes: "min",
  defects: "Defects",
  noDefects: "No defects reported",
  hold: "Hold",
  holdTitle: "Put this step on hold?",
  holdConsequence: "The step stops the clock until it's resumed.",
  subcontract: "Subcontract",
  subcontractTitle: "Send this step to a subcontractor",
  vendorLabel: "Vendor",
  slaDueLabel: "SLA due",
  reassign: "Reassign",
  assignedToLabel: "Assigned to (employee id)",
  cancel: "Cancel",
  send: "Send",
};

export interface StepDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Work-order number for the header, e.g. "WO-114". */
  woNo: string;
  step: WorkOrderStep;
  /** Defects already recorded against this step (`WorkOrderDetail.defects`, filtered by the caller). */
  defects: Defect[];
  /** Resolved display name for `step.assigned_to` — the drawer never fetches; the screen owns joins. */
  assignedToLabel?: string;
  onHold: (reason: string) => void | Promise<void>;
  onSubcontract: (vendor: string, slaDue: string) => void | Promise<void>;
  /** Omit to hide the reassign control — no `apps/api` endpoint changes `assigned_to` yet. */
  onReassign?: (assignedTo: string) => void | Promise<void>;
  /** Injectable clock for the elapsed-vs-standard read; defaults to the live clock. */
  now?: Date;
  labels?: Partial<StepDrawerLabels>;
  className?: string;
}

/**
 * The Gantt step drawer (M4 §3.2, design MD1) — assigned worker, machine, elapsed vs standard time,
 * and the defect log, with reassign / hold / subcontract actions. Hold requires a reason (backed by
 * `HoldRequest.reason`); subcontract captures a vendor + SLA due date (`SubcontractRequest`).
 */
export function StepDrawer({
  open,
  onOpenChange,
  woNo,
  step,
  defects,
  assignedToLabel,
  onHold,
  onSubcontract,
  onReassign,
  now,
  labels: labelsProp,
  className,
}: StepDrawerProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const timing = computeStepTiming(step, now);

  const [holdOpen, setHoldOpen] = React.useState(false);
  const [holdSubmitting, setHoldSubmitting] = React.useState(false);

  const [subcontractOpen, setSubcontractOpen] = React.useState(false);
  const [vendor, setVendor] = React.useState("");
  const [slaDue, setSlaDue] = React.useState("");
  const [subcontractSubmitting, setSubcontractSubmitting] = React.useState(false);

  const [reassignTo, setReassignTo] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setVendor("");
      setSlaDue("");
      setReassignTo("");
    }
  }, [open, step.id]);

  const handleHold = async ({ reason }: { reason?: string }) => {
    setHoldSubmitting(true);
    try {
      await onHold(reason ?? "");
      setHoldOpen(false);
    } finally {
      setHoldSubmitting(false);
    }
  };

  const handleSubcontract = async () => {
    if (!vendor.trim() || !slaDue) return;
    setSubcontractSubmitting(true);
    try {
      await onSubcontract(vendor.trim(), new Date(slaDue).toISOString());
      setSubcontractOpen(false);
    } finally {
      setSubcontractSubmitting(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={className}>
          <DrawerHeader>
            <div className="flex flex-col gap-1">
              <span className="text-caption text-text-muted">{woNo}</span>
              <DrawerTitle className="text-h3 font-semibold text-text-primary">{step.name}</DrawerTitle>
              <InkChip status={workOrderStepStatusToChip(step.status, step.is_delayed)} />
            </div>
          </DrawerHeader>

          <DrawerBody>
            <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 text-sm")}>
              <div>
                <dt className="text-caption text-text-muted">{labels.assigned}</dt>
                <dd className="text-text-primary">{assignedToLabel ?? labels.unassigned}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted">{labels.machine}</dt>
                <dd className="text-text-primary">{step.machine ?? labels.noMachine}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted">{labels.elapsed}</dt>
                <dd className={cn("text-text-primary", timing.overStandard && "font-semibold text-danger")}>
                  {timing.elapsedMin == null ? labels.notStarted : `${timing.elapsedMin} ${labels.minutes}`}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted">{labels.standard}</dt>
                <dd className="text-text-primary">
                  {timing.standardMin} {labels.minutes}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-col gap-2">
              <h3 className="text-caption font-semibold uppercase tracking-wide text-text-muted">
                {labels.defects}
              </h3>
              {defects.length === 0 ? (
                <p className="text-sm text-text-muted">{labels.noDefects}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {defects.map((defect) => (
                    <li key={defect.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-text-primary">{defect.type}</span>
                      <span className="text-text-secondary">{defect.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {onReassign && (
              <div className="mt-4 flex flex-col gap-2">
                <FormField label={labels.assignedToLabel}>
                  <Input value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} />
                </FormField>
                <Button
                  variant="secondary"
                  onClick={() => reassignTo.trim() && onReassign(reassignTo.trim())}
                  disabled={!reassignTo.trim()}
                >
                  {labels.reassign}
                </Button>
              </div>
            )}
          </DrawerBody>

          <DrawerFooter>
            <Button variant="secondary" disabled={step.status === "HOLD"} onClick={() => setHoldOpen(true)}>
              {labels.hold}
            </Button>
            <Button
              variant="secondary"
              disabled={step.status === "OUTSOURCED"}
              onClick={() => setSubcontractOpen(true)}
            >
              {labels.subcontract}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        title={labels.holdTitle}
        consequence={labels.holdConsequence}
        onConfirm={handleHold}
        confirmLabel={labels.hold}
        requireReason
        loading={holdSubmitting}
      />

      <Dialog open={subcontractOpen} onOpenChange={setSubcontractOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.subcontractTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label={labels.vendorLabel} required>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </FormField>
            <FormField label={labels.slaDueLabel} required>
              <Input type="datetime-local" value={slaDue} onChange={(e) => setSlaDue(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSubcontractOpen(false)} disabled={subcontractSubmitting}>
              {labels.cancel}
            </Button>
            <Button
              onClick={handleSubcontract}
              disabled={!vendor.trim() || !slaDue}
              loading={subcontractSubmitting}
            >
              {labels.send}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
