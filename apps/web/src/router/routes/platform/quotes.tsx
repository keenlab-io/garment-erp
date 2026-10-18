import * as React from "react";
import { useTranslation } from "react-i18next";
import { PlanCode, type QuoteComputeRequest, type QuoteResult } from "@erp/contracts";
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@erp/ui";
import { useMoneyFormat } from "../../../i18n/use-formatters.js";
import { parseMoneyInput, parseOptionalMoney } from "../../../platform/billing-utils.js";
import { useComputeQuoteMutation, useQuotePdfMutation } from "../../../platform/queries.js";
import { PlatformLayout } from "./platform-layout.js";

/**
 * The quote generator (M9 §6.1, design D6). The double-deduction eligibility checklist starts
 * UNDECLARED: nothing is sent — and the API returns no benefit section — until the prospect's
 * declaration is recorded (a box ticked + who declared it). Quotes are stateless.
 */
export function PlatformQuotesPage() {
  const { t } = useTranslation("platform");
  const money = useMoneyFormat();
  const compute = useComputeQuoteMutation();
  const pdf = useQuotePdfMutation();

  const [plan, setPlan] = React.useState<PlanCode>(PlanCode.FACTORY);
  const [annualFee, setAnnualFee] = React.useState("");
  const [setupFee, setSetupFee] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [term, setTerm] = React.useState("1");
  const [prospect, setProspect] = React.useState("");
  const [capitalOk, setCapitalOk] = React.useState(false);
  const [revenueOk, setRevenueOk] = React.useState(false);
  const [declaredBy, setDeclaredBy] = React.useState("");

  const fee = parseMoneyInput(annualFee);
  const setup = parseOptionalMoney(setupFee);
  const upfront = parseOptionalMoney(discount);
  const termYears = Number.parseInt(term, 10);
  const valid = fee !== null && setup !== null && upfront !== null && termYears > 0;
  // Undeclared until a box is ticked AND a declarer is named — otherwise no eligibility is sent at all.
  const declared = (capitalOk || revenueOk) && declaredBy.trim() !== "";

  function buildRequest(): QuoteComputeRequest | null {
    if (!fee || setup === null || upfront === null || !(termYears > 0)) return null;
    return {
      plan,
      term: termYears,
      fees: { annual_fee: fee, ...(setup ? { setup_fee: setup } : {}), ...(upfront ? { upfront_discount: upfront } : {}) },
      ...(prospect.trim() ? { prospect_name: prospect.trim() } : {}),
      ...(declared
        ? {
            eligibility: {
              registered_capital_at_most_5m: capitalOk,
              annual_revenue_at_most_30m: revenueOk,
              declared_by: declaredBy.trim(),
              declared_at: new Date().toISOString(),
            },
          }
        : {}),
    };
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = buildRequest();
    if (body) compute.mutate({ body });
  }

  function downloadPdf() {
    const body = buildRequest();
    if (!body) return;
    pdf.mutate({ body }, { onSuccess: (r) => r.status === 200 && window.open(r.body.url, "_blank", "noopener") });
  }

  const result: QuoteResult | null = compute.data?.status === 200 ? compute.data.body : null;

  return (
    <PlatformLayout>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("quotes.title")}</h1>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          <FormField label={t("quotes.prospect")}>
            <Input value={prospect} onChange={(e) => setProspect(e.target.value)} />
          </FormField>
          <FormField label={t("billing.plan")}>
            <Select value={plan} onValueChange={(v) => setPlan(v as PlanCode)}>
              <SelectTrigger aria-label={t("billing.plan")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(PlanCode).map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("billing.annualFeeField")} required>
            <Input inputMode="decimal" value={annualFee} onChange={(e) => setAnnualFee(e.target.value)} />
          </FormField>
          <FormField label={t("billing.setupFee")}>
            <Input inputMode="decimal" value={setupFee} onChange={(e) => setSetupFee(e.target.value)} />
          </FormField>
          <FormField label={t("billing.upfrontDiscount")}>
            <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </FormField>
          <FormField label={t("quotes.term")} required>
            <Input inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} />
          </FormField>

          <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-text-primary">{t("quotes.eligibilityHeading")}</legend>
            <p className="text-sm text-text-secondary">{t("quotes.eligibilityHint")}</p>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <Checkbox checked={capitalOk} onCheckedChange={(c) => setCapitalOk(c === true)} />
              {t("quotes.capitalCheck")}
            </label>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <Checkbox checked={revenueOk} onCheckedChange={(c) => setRevenueOk(c === true)} />
              {t("quotes.revenueCheck")}
            </label>
            <FormField label={t("quotes.declaredBy")}>
              <Input value={declaredBy} onChange={(e) => setDeclaredBy(e.target.value)} />
            </FormField>
            <p className="text-sm font-semibold text-text-secondary" data-testid="eligibility-state">
              {declared ? t("quotes.declared") : t("quotes.undeclared")}
            </p>
          </fieldset>

          {compute.isError && (
            <p role="alert" className="text-sm text-danger">
              {t("quotes.error")}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" loading={compute.isPending} disabled={!valid}>
              {t("quotes.compute")}
            </Button>
            <Button type="button" variant="secondary" loading={pdf.isPending} disabled={!valid} onClick={downloadPdf}>
              {t("quotes.pdf")}
            </Button>
          </div>
        </form>

        {result && (
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-surface p-5 shadow-sm" data-testid="quote-result">
            <h2 className="text-body-strong text-text-primary">{t("quotes.resultHeading")}</h2>
            <ul className="flex flex-col gap-1 text-sm text-text-secondary">
              {result.lines.map((line, i) => (
                <li key={i} className="flex justify-between">
                  <span>{line.description}</span>
                  <span className="tabular-nums">{money(line.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between text-sm font-semibold text-text-primary">
              <span>{t("quotes.firstYearTotal")}</span>
              <span className="tabular-nums">{money(result.first_year_total)}</span>
            </p>
            {result.tax_benefit && (
              <div className="flex flex-col gap-1 rounded-md border border-border bg-bg-app p-3 text-sm" data-testid="tax-benefit">
                <p className="font-semibold text-text-primary">{t("quotes.benefitHeading")}</p>
                <p className="text-text-secondary">
                  {t("quotes.estimatedSaving", {
                    min: money(result.tax_benefit.estimated_saving.min),
                    max: money(result.tax_benefit.estimated_saving.max),
                  })}
                </p>
                <p className="text-text-secondary">
                  {t("quotes.effectivePrice", {
                    min: money(result.tax_benefit.effective_price.min),
                    max: money(result.tax_benefit.effective_price.max),
                  })}
                </p>
                <p className="italic text-text-secondary">{result.tax_benefit.caveat}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </PlatformLayout>
  );
}
