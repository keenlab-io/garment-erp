import { VatApplicability, VatMode } from "@erp/contracts";
import { Radio, RadioGroup, cn } from "@erp/ui";

export interface VatModeCalcToggleLabels {
  vatModeLabel: string;
  vatOptionVat: string;
  vatOptionNonVat: string;
  calcLabel: string;
  calcOptionInclusive: string;
  calcOptionExclusive: string;
}

const defaultLabels: VatModeCalcToggleLabels = {
  vatModeLabel: "VAT",
  vatOptionVat: "VAT",
  vatOptionNonVat: "Non-VAT",
  calcLabel: "Calc",
  calcOptionInclusive: "Incl.",
  calcOptionExclusive: "Excl.",
};

export interface VatModeCalcToggleProps {
  vatMode: VatApplicability;
  onVatModeChange: (mode: VatApplicability) => void;
  vatCalc: VatMode;
  onVatCalcChange: (calc: VatMode) => void;
  labels?: Partial<VatModeCalcToggleLabels>;
  className?: string;
}

/**
 * The VAT mode/calc toggle (M5 §3.3, design MD2) — two radio groups (VAT/Non-VAT, then
 * inclusive/exclusive), preview-linked: the parent feeds `vatMode`/`vatCalc` into
 * `sales/totals.ts#computeDocumentTotals` and the live preview visibly re-breaks the totals on
 * every change (teaching the difference; preventing the classic tax error). The calc group is
 * disabled for Non-VAT, where inclusive/exclusive has no effect (design D2 — `vat = 0`,
 * `subtotal = grand_total`).
 */
export function VatModeCalcToggle({
  vatMode,
  onVatModeChange,
  vatCalc,
  onVatCalcChange,
  labels: labelsProp,
  className,
}: VatModeCalcToggleProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const calcDisabled = vatMode === VatApplicability.NON_VAT;

  return (
    <div className={cn("flex flex-wrap items-start gap-6", className)}>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-text-primary">{labels.vatModeLabel}</legend>
        <RadioGroup
          value={vatMode}
          onValueChange={(value) => onVatModeChange(value as VatApplicability)}
          aria-label={labels.vatModeLabel}
          className="flex-row gap-4"
        >
          {(
            [
              [VatApplicability.VAT, labels.vatOptionVat],
              [VatApplicability.NON_VAT, labels.vatOptionNonVat],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-text-primary">
              <Radio value={value} /> {label}
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={calcDisabled}>
        <legend className={cn("text-sm font-medium text-text-primary", calcDisabled && "text-text-muted")}>
          {labels.calcLabel}
        </legend>
        <RadioGroup
          value={vatCalc}
          onValueChange={(value) => onVatCalcChange(value as VatMode)}
          aria-label={labels.calcLabel}
          className="flex-row gap-4"
        >
          {(
            [
              [VatMode.VatNai, labels.calcOptionInclusive],
              [VatMode.VatNok, labels.calcOptionExclusive],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn("flex items-center gap-2 text-sm", calcDisabled ? "text-text-muted" : "text-text-primary")}
            >
              <Radio value={value} disabled={calcDisabled} /> {label}
            </label>
          ))}
        </RadioGroup>
      </fieldset>
    </div>
  );
}
