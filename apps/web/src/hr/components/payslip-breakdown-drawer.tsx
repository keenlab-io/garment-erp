import * as React from "react";
import { MaskedValue, MoneyCell, Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, cn } from "@erp/ui";

/**
 * One term of the net-pay formula. `kind` controls sign/weight: `earning` adds, `deduction`
 * subtracts (rendered via `MoneyCell`'s own negative-parenthesis styling — pass a negative
 * string), `net` is the emphasized final row.
 *
 * The `hr` contract's `PayslipSummary` (`packages/contracts/src/dto/hr.ts`) only exposes
 * `gross`/`net` today — the underlying `payslip.breakdown` jsonb (base/OT/allowances/
 * deductions/SSO/tax/advance) isn't wired through yet. This component is built against this
 * richer, locally-defined shape so the screen (M2 §4.2) can map to it once that contract gap
 * closes, rather than baking the drawer to today's narrower wire shape.
 */
export interface PayslipLine {
  key: string;
  label: string;
  /** A decimal money string; negative for deductions. */
  amount: string;
  kind: "earning" | "deduction" | "net";
}

export interface PayslipBreakdownDrawerLabels {
  title: (employeeName: string) => string;
  period: string;
}

const defaultLabels: PayslipBreakdownDrawerLabels = {
  title: (employeeName) => `Payslip — ${employeeName}`,
  period: "Period",
};

export interface PayslipBreakdownDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  /** Payroll period, e.g. "2026-07". */
  period: string;
  /** Every term of the net-pay formula, in display order — nothing is hidden. */
  lines: PayslipLine[];
  labels?: Partial<PayslipBreakdownDrawerLabels>;
  className?: string;
}

/**
 * Payslip breakdown drawer (M2 §3.2, design MD2) — read-only, renders every term of the net-pay
 * formula line by line so nothing is a black box. Values are masked without `hr.salary.view`.
 */
export function PayslipBreakdownDrawer({
  open,
  onOpenChange,
  employeeName,
  period,
  lines,
  labels: labelsProp,
  className,
}: PayslipBreakdownDrawerProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={className}>
        <DrawerHeader>
          <DrawerTitle className="text-h3 font-semibold text-text-primary">
            {labels.title(employeeName)}
          </DrawerTitle>
          <p className="text-caption text-text-muted">
            {labels.period}: {period}
          </p>
        </DrawerHeader>
        <DrawerBody>
          <dl className="flex flex-col gap-2">
            {lines.map((line) => (
              <div
                key={line.key}
                className={cn(
                  "flex items-baseline justify-between gap-3 border-b border-border py-1.5",
                  line.kind === "net" && "border-t border-border pt-2 text-body-strong",
                )}
              >
                <dt className={cn("text-sm text-text-secondary", line.kind === "net" && "text-text-primary")}>
                  {line.label}
                </dt>
                <dd>
                  <MaskedValue permission="hr.salary.view" value={<MoneyCell value={line.amount} />} />
                </dd>
              </div>
            ))}
          </dl>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
