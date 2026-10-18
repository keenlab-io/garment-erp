import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  SubscriptionInvoiceStatus,
  SubscriptionPaymentMethod,
  SubscriptionStatus,
  type SubscriptionInvoice,
  type TenantListItem,
} from "@erp/contracts";
import {
  Button,
  FormField,
  InkChip,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "@erp/ui";
import { platformApi } from "../platform-client.js";
import { parseMoneyInput, parseOptionalMoney } from "../billing-utils.js";
import {
  useIssueSubscriptionInvoiceMutation,
  useMarkInvoicePaidMutation,
  usePlansQuery,
  useCreateSubscriptionMutation,
  useSubscriptionInvoicesQuery,
  useTenantSubscriptionQuery,
  useVoidInvoiceMutation,
} from "../queries.js";
import { useDateFormat, useMoneyFormat } from "../../i18n/use-formatters.js";

/** Subscription, invoices, mark-paid and void for one tenant (M9 §6.1) — offline billing, no gateway. */
export function BillingSection({ tenant }: { tenant: TenantListItem }) {
  const { t } = useTranslation("platform");
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  const money = useMoneyFormat();
  const subscriptionQuery = useTenantSubscriptionQuery(tenant.id);
  const subscription =
    subscriptionQuery.data?.status === 200 ? subscriptionQuery.data.body.subscription : null;

  const invoicesQuery = useSubscriptionInvoicesQuery({ tenant_id: tenant.id });
  const invoices = invoicesQuery.data?.status === 200 ? invoicesQuery.data.body.data : [];

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
      <h2 className="text-body-strong text-text-primary">{t("billing.heading")}</h2>

      {subscriptionQuery.isLoading ? (
        <p className="text-sm text-text-secondary">{t("billing.loading")}</p>
      ) : subscription ? (
        <div className="flex flex-col gap-1 text-sm text-text-secondary" data-testid="subscription-view">
          <div className="flex items-center gap-2">
            {t("billing.status")}
            <InkChip
              status={subscription.status === SubscriptionStatus.ACTIVE ? "completed" : subscription.status === SubscriptionStatus.IN_GRACE ? "hold" : "void"}
              label={t(`billing.subStatus_${subscription.status}`)}
            />
          </div>
          <p>{t("billing.annualFee", { fee: money(subscription.annual_fee) })}</p>
          <p>
            {t("billing.term", {
              start: dateFormat.format(new Date(subscription.term_start)),
              end: dateFormat.format(new Date(subscription.term_end)),
            })}
          </p>
        </div>
      ) : (
        <CreateSubscriptionForm tenantId={tenant.id} />
      )}

      {subscription && subscription.status !== SubscriptionStatus.CANCELLED && (
        <IssueInvoiceForm subscriptionId={subscription.id} />
      )}

      {subscription && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text-primary">{t("billing.invoices")}</h3>
          {invoices.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("billing.noInvoices")}</p>
          ) : (
            invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)
          )}
        </div>
      )}
    </section>
  );
}

function CreateSubscriptionForm({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation("platform");
  const { toast } = useToast();
  const plans = usePlansQuery();
  const create = useCreateSubscriptionMutation();
  const [planId, setPlanId] = React.useState("");
  const [fee, setFee] = React.useState("");
  const [termStart, setTermStart] = React.useState(new Date().toISOString().slice(0, 10));
  const annualFee = parseMoneyInput(fee);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!annualFee || !planId) return;
    create.mutate(
      {
        body: {
          tenant_id: tenantId,
          plan_id: planId,
          annual_fee: annualFee,
          term_start: new Date(`${termStart}T00:00:00+07:00`).toISOString(),
        },
      },
      { onSuccess: () => toast({ tone: "success", title: t("billing.subscriptionCreated") }) },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">{t("billing.noSubscription")}</p>
      {create.isError && (
        <p role="alert" className="text-sm text-danger">
          {t("billing.createError")}
        </p>
      )}
      <FormField label={t("billing.plan")} required>
        <Select value={planId} onValueChange={setPlanId}>
          <SelectTrigger aria-label={t("billing.plan")}>
            <SelectValue placeholder={t("billing.planPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {(plans.data?.status === 200 ? plans.data.body : []).map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label={t("billing.annualFeeField")} required>
        <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
      </FormField>
      <FormField label={t("billing.termStart")} required>
        <Input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />
      </FormField>
      <div>
        <Button type="submit" loading={create.isPending} disabled={!annualFee || !planId || !termStart}>
          {t("billing.createSubscription")}
        </Button>
      </div>
    </form>
  );
}

function IssueInvoiceForm({ subscriptionId }: { subscriptionId: string }) {
  const { t } = useTranslation("platform");
  const { toast } = useToast();
  const issue = useIssueSubscriptionInvoiceMutation();
  const [open, setOpen] = React.useState(false);
  const [setupFee, setSetupFee] = React.useState("");
  const [discount, setDiscount] = React.useState("");

  const setup = parseOptionalMoney(setupFee);
  const upfront = parseOptionalMoney(discount);

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t("billing.issueInvoice")}
        </Button>
      </div>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (setup === null || upfront === null) return;
    issue.mutate(
      {
        body: {
          subscription_id: subscriptionId,
          ...(setup ? { setup_fee: setup } : {}),
          ...(upfront ? { upfront_discount: upfront } : {}),
        },
      },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("billing.invoiceIssued") });
          setOpen(false);
          setSetupFee("");
          setDiscount("");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-border p-3">
      {issue.isError && (
        <p role="alert" className="text-sm text-danger">
          {t("billing.issueError")}
        </p>
      )}
      <FormField label={t("billing.setupFee")} help={t("billing.setupFeeHint")}>
        <Input inputMode="decimal" value={setupFee} onChange={(e) => setSetupFee(e.target.value)} />
      </FormField>
      <FormField label={t("billing.upfrontDiscount")} help={t("billing.upfrontDiscountHint")}>
        <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" loading={issue.isPending} disabled={setup === null || upfront === null}>
          {t("billing.issue")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("billing.cancel")}
        </Button>
      </div>
    </form>
  );
}

type RowMode = "idle" | "mark-paid" | "void";

function InvoiceRow({ invoice }: { invoice: SubscriptionInvoice }) {
  const { t } = useTranslation("platform");
  const money = useMoneyFormat();
  const [mode, setMode] = React.useState<RowMode>("idle");
  const [pdfError, setPdfError] = React.useState(false);

  async function openPdf() {
    setPdfError(false);
    try {
      const response = await platformApi.platform.getSubscriptionInvoicePdf.query({ params: { id: invoice.id } });
      if (response.status !== 200) throw response;
      window.open(response.body.url, "_blank", "noopener");
    } catch {
      setPdfError(true);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm" data-testid="invoice-row">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-text-link">{invoice.number}</span>
        <InkChip
          status={
            invoice.status === SubscriptionInvoiceStatus.PAID
              ? "completed"
              : invoice.status === SubscriptionInvoiceStatus.VOID
                ? "void"
                : "hold"
          }
          label={t(`billing.invStatus_${invoice.status}`)}
        />
      </div>
      <div className="text-text-secondary">{t("billing.invoiceTotal", { total: money(invoice.total) })}</div>
      {pdfError && (
        <p role="alert" className="text-danger">
          {t("billing.pdfError")}
        </p>
      )}
      {mode === "idle" && (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void openPdf()}>
            {t("billing.pdf")}
          </Button>
          {invoice.status === SubscriptionInvoiceStatus.ISSUED && (
            <>
              <Button variant="secondary" onClick={() => setMode("mark-paid")}>
                {t("billing.markPaid")}
              </Button>
              <Button variant="ghost" onClick={() => setMode("void")}>
                {t("billing.void")}
              </Button>
            </>
          )}
        </div>
      )}
      {mode === "mark-paid" && <MarkPaidForm invoice={invoice} onDone={() => setMode("idle")} />}
      {mode === "void" && <VoidForm invoice={invoice} onDone={() => setMode("idle")} />}
    </div>
  );
}

function MarkPaidForm({ invoice, onDone }: { invoice: SubscriptionInvoice; onDone: () => void }) {
  const { t } = useTranslation("platform");
  const { toast } = useToast();
  const markPaid = useMarkInvoicePaidMutation();
  const [paidOn, setPaidOn] = React.useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = React.useState<SubscriptionPaymentMethod>(SubscriptionPaymentMethod.BANK_TRANSFER);
  const [reference, setReference] = React.useState("");
  const [amount, setAmount] = React.useState<string>(invoice.total);
  const [accept, setAccept] = React.useState(false);
  const parsedAmount = parseMoneyInput(amount);
  const mismatch = parsedAmount !== null && Number(parsedAmount) !== Number(invoice.total);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsedAmount || !reference.trim()) return;
    markPaid.mutate(
      {
        params: { id: invoice.id },
        body: {
          paid_at: new Date(`${paidOn}T00:00:00+07:00`).toISOString(),
          method,
          reference: reference.trim(),
          amount: parsedAmount,
          ...(mismatch && accept
            ? Number(parsedAmount) < Number(invoice.total)
              ? { accept_partial: true }
              : { accept_over: true }
            : {}),
        },
      },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("billing.markedPaid") });
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {markPaid.isError && (
        <p role="alert" className="text-danger">
          {t("billing.markPaidError")}
        </p>
      )}
      <FormField label={t("billing.paidOn")} required>
        <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </FormField>
      <FormField label={t("billing.method")}>
        <Select value={method} onValueChange={(v) => setMethod(v as SubscriptionPaymentMethod)}>
          <SelectTrigger aria-label={t("billing.method")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(SubscriptionPaymentMethod).map((m) => (
              <SelectItem key={m} value={m}>
                {t(`billing.method_${m}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label={t("billing.reference")} required help={t("billing.referenceHint")}>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />
      </FormField>
      <FormField label={t("billing.amountReceived")} required>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      {mismatch && (
        <label className="flex items-center gap-2 text-warning-on">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          {t("billing.acceptMismatch")}
        </label>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          loading={markPaid.isPending}
          disabled={!parsedAmount || !reference.trim() || (mismatch && !accept)}
        >
          {t("billing.confirmPaid")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("billing.cancel")}
        </Button>
      </div>
    </form>
  );
}

function VoidForm({ invoice, onDone }: { invoice: SubscriptionInvoice; onDone: () => void }) {
  const { t } = useTranslation("platform");
  const { toast } = useToast();
  const voidInvoice = useVoidInvoiceMutation();
  const [reason, setReason] = React.useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    voidInvoice.mutate(
      { params: { id: invoice.id }, body: { reason } },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("billing.voided") });
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {voidInvoice.isError && (
        <p role="alert" className="text-danger">
          {t("billing.voidError")}
        </p>
      )}
      <FormField label={t("billing.voidReason")} required>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" loading={voidInvoice.isPending} disabled={!reason.trim()}>
          {t("billing.confirmVoid")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("billing.cancel")}
        </Button>
      </div>
    </form>
  );
}
