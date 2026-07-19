import * as React from "react";
import { useTranslation } from "react-i18next";
import { InvoiceStatus, PaymentMethod, asMoney } from "@erp/contracts";
import { toDecimal } from "@erp/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  GuardedActionDialog,
  Input,
  MoneyCell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "@erp/ui";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { DocLifecycleChip } from "../../../sales/components/doc-lifecycle-chip.js";
import { upsertInvoice, useSalesDocument, useSalesDocuments } from "../../../sales/document-store.js";
import { DOC_LIFECYCLE_LABEL_KEY } from "../../../sales/doc-lifecycle-labels.js";
import { useRecordPaymentMutation, useVoidInvoiceMutation } from "../../../sales/queries.js";

const PAYABLE_STATUSES = new Set<string>([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE]);

const PAYMENT_METHOD_LABEL_KEY = {
  TRANSFER: "payments.methodTransfer",
  PROMPTPAY: "payments.methodPromptpay",
  CASH: "payments.methodCash",
  CHEQUE: "payments.methodCheque",
  CREDIT_CARD: "payments.methodCreditCard",
} as const satisfies Record<PaymentMethod, string>;

/**
 * The payments screen (M5 §4.3, design MD5) — record a full/partial payment against an invoice
 * (full issues the receipt/tax-invoice and flips PAID; partial → PARTIALLY_PAID) and a guarded
 * void that's blocked with an explanatory dialog when a receipt already exists (`voidInvoice`
 * 409s — `sales/queries.ts`'s comment on the mutation). Same session-store gap as the worklist:
 * the invoice picker only ever shows invoices touched this session.
 */
export function PaymentsPage() {
  const { t } = useTranslation("sales");
  const { toast } = useToast();
  const dateTimeFormat = useDateFormat({ dateStyle: "medium", timeStyle: "short" });

  const documents = useSalesDocuments();
  const invoiceRecords = documents.filter((d) => d.kind === "invoice");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = useSalesDocument(selectedId ?? undefined);
  const invoice = selected?.kind === "invoice" ? selected.invoice : null;
  const receipt = selected?.kind === "invoice" ? selected.receipt : null;

  const outstanding = invoice ? toDecimal(invoice.grand_total).minus(toDecimal(invoice.amount_paid)).toFixed(4) : "0";

  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>(PaymentMethod.TRANSFER);
  const [promptpayRef, setPromptpayRef] = React.useState("");
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [blockedOpen, setBlockedOpen] = React.useState(false);

  // Resets only when the selected invoice changes, not on every `outstanding` recompute.
  React.useEffect(() => {
    setAmount(outstanding);
    setMethod(PaymentMethod.TRANSFER);
    setPromptpayRef("");
  }, [selectedId]);

  const recordPayment = useRecordPaymentMutation();
  const voidInvoice = useVoidInvoiceMutation();

  async function handleRecordPayment() {
    if (!invoice || !amount) return;
    const result = await recordPayment.mutateAsync({
      params: { id: invoice.id },
      body: { amount: asMoney(amount), method, promptpay_ref: method === PaymentMethod.PROMPTPAY ? promptpayRef || undefined : undefined },
    });
    // `recordPayment` only returns the payment + receipt, not the invoice it applied to (contract
    // gap) — derive the invoice's new amount_paid/status the same way the server does (full pays
    // off the balance -> PAID, otherwise PARTIALLY_PAID).
    const newAmountPaid = toDecimal(invoice.amount_paid).plus(toDecimal(result.body.payment.amount));
    const newStatus = newAmountPaid.gte(toDecimal(invoice.grand_total)) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
    upsertInvoice({ ...invoice, amount_paid: asMoney(newAmountPaid.toFixed(4)), status: newStatus }, result.body.receipt);
    toast({ tone: "success", title: t("payments.recorded") });
  }

  function handleVoid(result: { reason?: string }) {
    if (!invoice) return;
    voidInvoice.mutate(
      { params: { id: invoice.id }, body: { reason: result.reason ?? "" } },
      {
        onSuccess: (response) => {
          upsertInvoice(response.body.invoice);
          setVoidOpen(false);
          toast({ tone: "success", title: t("payments.voided") });
        },
        onError: (error) => {
          if (error.status === 409) {
            setVoidOpen(false);
            setBlockedOpen(true);
          }
        },
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-text-primary">{t("payments.title")}</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface p-3 shadow-sm">
          {invoiceRecords.length === 0 ? (
            <p className="text-sm text-text-muted">{t("payments.empty")}</p>
          ) : (
            invoiceRecords.map((record) =>
              record.kind === "invoice" ? (
                <button
                  key={record.invoice.id}
                  type="button"
                  onClick={() => setSelectedId(record.invoice.id)}
                  className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm ${
                    selectedId === record.invoice.id ? "border-accent bg-accent-subtle" : "border-border hover:bg-bg-sunken"
                  }`}
                >
                  <span className="font-mono text-mono text-text-link">{record.invoice.doc_no}</span>
                  <span className="text-text-secondary">{record.customer?.name ?? record.invoice.customer_id}</span>
                  <DocLifecycleChip status={record.invoice.status} label={t(DOC_LIFECYCLE_LABEL_KEY[record.invoice.status])} />
                </button>
              ) : null,
            )
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          {!invoice ? (
            <p className="text-sm text-text-muted">{t("payments.selectInvoice")}</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-mono text-text-primary">{invoice.doc_no}</p>
                  <p className="text-sm text-text-secondary">{selected?.customer?.name ?? invoice.customer_id}</p>
                </div>
                <DocLifecycleChip status={invoice.status} label={t(DOC_LIFECYCLE_LABEL_KEY[invoice.status])} />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <dt className="text-caption text-text-muted">{t("payments.grandTotal")}</dt>
                  <dd>
                    <MoneyCell value={invoice.grand_total} />
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-text-muted">{t("payments.amountPaid")}</dt>
                  <dd>
                    <MoneyCell value={invoice.amount_paid} />
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-text-muted">{t("payments.outstanding")}</dt>
                  <dd>
                    <MoneyCell value={outstanding} />
                  </dd>
                </div>
              </dl>

              {receipt && (
                <div className="rounded-md border border-success bg-success-subtle px-3 py-2 text-sm text-success-on">
                  <p className="font-mono text-mono">{receipt.doc_no}</p>
                  <p>{t("payments.receiptIssued", { date: dateTimeFormat.format(new Date(receipt.paid_at)) })}</p>
                </div>
              )}

              {PAYABLE_STATUSES.has(invoice.status) && (
                <div className="flex flex-wrap items-end gap-3">
                  <FormField label={t("payments.amountLabel")}>
                    <Input type="number" step="0.0001" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
                  </FormField>
                  <FormField label={t("payments.methodLabel")}>
                    <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                      <SelectTrigger aria-label={t("payments.methodLabel")} className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(PaymentMethod).map((m) => (
                          <SelectItem key={m} value={m}>
                            {t(PAYMENT_METHOD_LABEL_KEY[m])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  {method === PaymentMethod.PROMPTPAY && (
                    <FormField label={t("payments.promptpayRefLabel")}>
                      <Input value={promptpayRef} onChange={(e) => setPromptpayRef(e.target.value)} className="w-40" />
                    </FormField>
                  )}
                  <Button onClick={() => void handleRecordPayment()} loading={recordPayment.isPending} disabled={!amount}>
                    {t("payments.recordAction")}
                  </Button>
                </div>
              )}

              <div>
                <Button variant="secondary" onClick={() => setVoidOpen(true)}>
                  {t("payments.voidAction")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {invoice && (
        <GuardedActionDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          kind="document-void"
          subject={invoice.doc_no}
          onConfirm={handleVoid}
          loading={voidInvoice.isPending}
        />
      )}

      <Dialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payments.voidBlockedTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t("payments.voidBlockedBody")}</p>
          <DialogFooter>
            <Button onClick={() => setBlockedOpen(false)}>{t("payments.voidBlockedClose")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
