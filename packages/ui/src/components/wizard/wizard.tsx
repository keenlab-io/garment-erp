import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { Icon } from "../icon/icon.js";
import { Button } from "../button/button.js";

export interface WizardStep {
  key: string;
  label: string;
}

export interface WizardLabels {
  stepsAriaLabel: string;
}

const defaultLabels: WizardLabels = {
  stepsAriaLabel: "Steps",
};

export interface WizardProps {
  steps: WizardStep[];
  activeStep: string;
  /** Jump directly to an already-visited step by clicking its header entry — steps ahead of the
   * active one are never reachable from the header; forward progress only happens through the
   * per-step `WizardNav`/caller-owned continue action, which is where per-step validation lives. */
  onStepChange: (key: string) => void;
  labels?: Partial<WizardLabels>;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The shared multi-step wizard chrome (M3 §3.3, design MD6) — a numbered step header (done/current/
 * future, connected by a rule) plus a body slot for the caller's per-step content. Promoted from
 * `PayrollWizard`'s bespoke stepper (M2 §3.1) so goods-receipt (M3), create-WO (M4), and payroll
 * (M2, on migration) share one implementation. Presentational only: the caller owns step content,
 * per-step validation gates, and the review/finish actions (`WizardNav` covers the common Back/
 * Continue footer, but a guarded final step can render its own instead).
 */
export function Wizard({ steps, activeStep, onStepChange, labels: labelsProp, className, children }: WizardProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const activeIndex = steps.findIndex((step) => step.key === activeStep);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <ol className="flex items-center gap-2" aria-label={labels.stepsAriaLabel}>
        {steps.map((step, index) => {
          const isCurrent = index === activeIndex;
          const isDone = index < activeIndex;
          const reachable = index <= activeIndex;
          return (
            <li key={step.key} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => reachable && onStepChange(step.key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium",
                  isCurrent && "bg-accent-subtle text-accent-text",
                  !isCurrent && reachable && "text-text-primary hover:bg-bg-sunken",
                  !reachable && "text-text-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-caption",
                    isDone && "border-success bg-success-subtle text-success-on",
                    isCurrent && "border-accent bg-accent text-text-inverse",
                    !isDone && !isCurrent && "border-border text-text-muted",
                  )}
                >
                  {isDone ? <Icon icon={Check} size={12} /> : index + 1}
                </span>
                {step.label}
              </button>
              {index < steps.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {children}
    </div>
  );
}

export interface WizardNavLabels {
  back: string;
  continueLabel: string;
}

const defaultNavLabels: WizardNavLabels = {
  back: "Back",
  continueLabel: "Continue",
};

export interface WizardNavProps {
  onBack?: () => void;
  onContinue?: () => void;
  /** The per-step validation gate — disables Continue until the active step's content is valid. */
  continueDisabled?: boolean;
  /** Override the Continue button's label for the step (e.g. "Post", "Review"). */
  continueLabel?: string;
  labels?: Partial<WizardNavLabels>;
  className?: string;
}

/** The common Back/Continue footer for a `Wizard` step. Skip it for a step whose primary action
 * needs a permission guard or confirm dialog (e.g. a guarded approve/post) and render that instead. */
export function WizardNav({
  onBack,
  onContinue,
  continueDisabled = false,
  continueLabel,
  labels: labelsProp,
  className,
}: WizardNavProps) {
  const labels = { ...defaultNavLabels, ...labelsProp };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {onBack && (
        <Button variant="secondary" onClick={onBack}>
          {labels.back}
        </Button>
      )}
      {onContinue && (
        <Button onClick={onContinue} disabled={continueDisabled}>
          {continueLabel ?? labels.continueLabel}
        </Button>
      )}
    </div>
  );
}
