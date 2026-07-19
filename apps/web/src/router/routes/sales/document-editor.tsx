import * as React from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { InvoiceStatus, QuotationStatus, VatApplicability, VatMode } from "@erp/contracts";
import type { Customer, DocLineInput } from "@erp/contracts";
import {
  Button,
  FormField,
  Input,
  PermissionButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "@erp/ui";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { useItemsQuery } from "../../../inventory/queries.js";
import { SALES_DOCUMENTS_PATH, SALES_PAYMENTS_PATH } from "../../../nav/sales-paths.js";
import { CustomerAutocomplete } from "../../../sales/components/customer-autocomplete.js";
import { DocLifecycleChip } from "../../../sales/components/doc-lifecycle-chip.js";
import {
  DocumentLineEditor,
  emptyDocumentLine,
  type DocumentLineEditorLine,
} from "../../../sales/components/document-line-editor.js";
import { PaperPreview, type PaperPreviewLine } from "../../../sales/components/paper-preview.js";
import { PromptPayQrBlock } from "../../../sales/components/promptpay-qr-block.js";
import { VatModeCalcToggle } from "../../../sales/components/vat-mode-calc-toggle.js";
import { WhtNetToReceivePanel } from "../../../sales/components/wht-net-to-receive-panel.js";
import {
  getDocument,
  upsertInvoice,
  upsertQuotation,
  useSalesDocument,
} from "../../../sales/document-store.js";
import {
  useApproveQuotationMutation,
  useConvertQuotationMutation,
  useCreateInvoiceMutation,
  useCreateQuotationMutation,
  useCustomersQuery,
  useInvoicePromptPayQrQuery,
  useIssueInvoiceMutation,
  useRejectQuotationMutation,
  useSendQuotationMutation,
} from "../../../sales/queries.js";
import { computeDocumentTotals, lineTotal } from "../../../sales/totals.js";

type DocKind = "quotation" | "invoice";

function toDocLineInput(line: DocumentLineEditorLine): DocLineInput {
  return { item_id: line.item_id, description: line.description, qty: line.qty, unit_price: line.unit_price, discount: line.discount };
}

/**
 * The document editor / viewer (M5 §4.1, design MD1–MD3) — the split editor ⟷ live paper preview.
 * The `sales` contract has no update-after-create endpoint for a quotation or invoice (only
 * lifecycle-transition mutations, `document-store.ts`'s header comment), so "editable" only ever
 * applies to a not-yet-created document: once `id` resolves to a record in the session store, this
 * screen is a read-only preview plus whichever lifecycle action the document's status allows next
 * — the same content whether reached via `/sales/documents/$id` or `/sales/documents/$id/edit`.
 */
function DocumentEditorScreen({ id }: { id: string }) {
  const { t } = useTranslation("sales");
  const { toast } = useToast();
  const navigate = useNavigate();
  const dateFormat = useDateFormat({ dateStyle: "medium" });

  const record = useSalesDocument(id === "new" ? undefined : id);
  const isNew = !record;

  const [docKind, setDocKind] = React.useState<DocKind>("quotation");
  const [customerId, setCustomerId] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [vatMode, setVatMode] = React.useState<VatApplicability>(VatApplicability.VAT);
  const [vatCalc, setVatCalc] = React.useState<VatMode>(VatMode.VatNok);
  const [validUntil, setValidUntil] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [creditTermsDays, setCreditTermsDays] = React.useState("");
  const [whtRate, setWhtRate] = React.useState("");
  const [lines, setLines] = React.useState<DocumentLineEditorLine[]>([emptyDocumentLine()]);

  const customersQuery = useCustomersQuery({ search: customerSearch || undefined, limit: 20 });
  const itemsQuery = useItemsQuery({ limit: 100 });
  const customerOptions = React.useMemo(() => {
    const fetched = customersQuery.data?.body.data ?? [];
    return selectedCustomer && !fetched.some((c) => c.id === selectedCustomer.id)
      ? [selectedCustomer, ...fetched]
      : fetched;
  }, [customersQuery.data, selectedCustomer]);
  const itemOptions = React.useMemo(
    () => (itemsQuery.data?.body.data ?? []).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` })),
    [itemsQuery.data],
  );

  const createQuotation = useCreateQuotationMutation();
  const createInvoice = useCreateInvoiceMutation();
  const sendQuotation = useSendQuotationMutation();
  const approveQuotation = useApproveQuotationMutation();
  const rejectQuotation = useRejectQuotationMutation();
  const convertQuotation = useConvertQuotationMutation();
  const issueInvoice = useIssueInvoiceMutation();

  const invoiceId = record?.kind === "invoice" ? record.invoice.id : null;
  const invoiceIssued = record?.kind === "invoice" && record.invoice.status !== InvoiceStatus.DRAFT;
  const promptPayQr = useInvoicePromptPayQrQuery(invoiceId ?? "", { enabled: Boolean(invoiceId) && invoiceIssued });

  const validLines = lines.filter((l) => l.description.trim() !== "" && Number(l.qty) > 0);
  const canSubmit = Boolean(customerId) && validLines.length > 0;

  async function handleCreate() {
    if (!canSubmit) return;
    const body = validLines.map(toDocLineInput);
    if (docKind === "quotation") {
      const result = await createQuotation.mutateAsync({
        body: { customer_id: customerId, vat_mode: vatMode, vat_calc: vatCalc, valid_until: validUntil || undefined, lines: body },
      });
      upsertQuotation(result.body.quotation, selectedCustomer);
      toast({ tone: "success", title: t("documentEditor.created") });
      void navigate({ to: "/sales/documents/$id/edit", params: { id: result.body.quotation.id }, replace: true });
    } else {
      const result = await createInvoice.mutateAsync({
        body: {
          customer_id: customerId,
          due_date: dueDate || undefined,
          credit_terms_days: creditTermsDays ? Number(creditTermsDays) : undefined,
          wht_rate: whtRate || undefined,
          lines: body,
        },
      });
      upsertInvoice(result.body.invoice, undefined, selectedCustomer);
      toast({ tone: "success", title: t("documentEditor.created") });
      void navigate({ to: "/sales/documents/$id/edit", params: { id: result.body.invoice.id }, replace: true });
    }
  }

  async function handleSend() {
    if (record?.kind !== "quotation") return;
    const result = await sendQuotation.mutateAsync({ params: { id: record.quotation.id }, body: undefined });
    upsertQuotation(result.body.quotation);
    toast({ tone: "success", title: t("documentEditor.sent") });
  }

  async function handleApprove() {
    if (record?.kind !== "quotation") return;
    const result = await approveQuotation.mutateAsync({ params: { id: record.quotation.id }, body: undefined });
    upsertQuotation(result.body.quotation);
    toast({ tone: "success", title: t("documentEditor.approved") });
  }

  async function handleReject() {
    if (record?.kind !== "quotation") return;
    const result = await rejectQuotation.mutateAsync({ params: { id: record.quotation.id }, body: undefined });
    upsertQuotation(result.body.quotation);
    toast({ tone: "success", title: t("documentEditor.rejected") });
  }

  async function handleConvert() {
    if (record?.kind !== "quotation") return;
    const source = getDocument(record.quotation.id);
    const sourceCustomer = source?.customer ?? null;
    const result = await convertQuotation.mutateAsync({ params: { id: record.quotation.id }, body: undefined });
    upsertInvoice(result.body.invoice, undefined, sourceCustomer);
    toast({ tone: "success", title: t("documentEditor.converted") });
    void navigate({ to: "/sales/documents/$id/edit", params: { id: result.body.invoice.id }, replace: true });
  }

  async function handleIssue() {
    if (record?.kind !== "invoice") return;
    const result = await issueInvoice.mutateAsync({ params: { id: record.invoice.id }, body: undefined });
    upsertInvoice(result.body.invoice);
    toast({ tone: "success", title: t("documentEditor.issued") });
  }

  const totals = React.useMemo(() => {
    if (!isNew) {
      if (record?.kind === "quotation") {
        return { subtotal: record.quotation.subtotal, vat_amount: record.quotation.vat_amount, wht_amount: null as string | null, grand_total: record.quotation.grand_total };
      }
      if (record?.kind === "invoice") {
        return { subtotal: record.invoice.subtotal, vat_amount: record.invoice.vat_amount, wht_amount: record.invoice.wht_amount, grand_total: record.invoice.grand_total };
      }
    }
    const computed = computeDocumentTotals(
      validLines.map(toDocLineInput),
      { vat_mode: docKind === "quotation" ? vatMode : VatApplicability.VAT, vat_calc: docKind === "quotation" ? vatCalc : VatMode.VatNok, wht_rate: docKind === "invoice" ? whtRate || null : null },
    );
    return { subtotal: computed.subtotal, vat_amount: computed.vat_amount, wht_amount: docKind === "invoice" ? computed.wht_amount : null, grand_total: computed.grand_total };
  }, [isNew, record, validLines, docKind, vatMode, vatCalc, whtRate]);

  const previewLines: PaperPreviewLine[] = React.useMemo(() => {
    if (!isNew && record?.kind === "quotation") {
      return record.quotation.lines.map((l) => ({ id: l.id, description: l.description, qty: l.qty, unitPrice: l.unit_price, lineTotal: l.line_total }));
    }
    if (!isNew && record?.kind === "invoice") {
      return record.invoice.lines.map((l) => ({ id: l.id, description: l.description, qty: l.qty, unitPrice: l.unit_price, lineTotal: l.line_total }));
    }
    return validLines.map((l) => ({ id: l.id, description: l.description, qty: l.qty, unitPrice: l.unit_price, lineTotal: lineTotal(l) }));
  }, [isNew, record, validLines]);

  const previewCustomer = selectedCustomer ?? record?.customer ?? null;
  const docNo = record?.kind === "quotation" ? record.quotation.doc_no : record?.kind === "invoice" ? record.invoice.doc_no : undefined;
  const status = record?.kind === "quotation" ? record.quotation.status : record?.kind === "invoice" ? record.invoice.status : null;
  const customerIdFallback = record?.kind === "quotation" ? record.quotation.customer_id : record?.kind === "invoice" ? record.invoice.customer_id : undefined;
  // Quotations carry no created/issued date field in the contract — only invoices do (`issue_date`).
  const previewDate = record?.kind === "invoice" ? dateFormat.format(new Date(record.invoice.issue_date)) : dateFormat.format(new Date());

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to={SALES_DOCUMENTS_PATH} className="text-sm text-text-link">
          ← {t("documentEditor.backToWorklist")}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-h1 font-semibold text-text-primary">
            {isNew ? t("documentEditor.newTitle") : docNo}
          </h1>
          {status && <DocLifecycleChip status={status} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-5 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
          {isNew ? (
            <>
              <FormField label={t("documentEditor.docTypeLabel")}>
                <Select value={docKind} onValueChange={(v) => setDocKind(v as DocKind)}>
                  <SelectTrigger aria-label={t("documentEditor.docTypeLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quotation">{t("documentEditor.docTypeQuotation")}</SelectItem>
                    <SelectItem value="invoice">{t("documentEditor.docTypeInvoice")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <CustomerAutocomplete
                customers={customerOptions}
                value={customerId}
                onSelect={(customer) => {
                  setCustomerId(customer?.id ?? "");
                  setSelectedCustomer(customer);
                }}
                loading={customersQuery.isLoading}
                onSearchChange={setCustomerSearch}
                labels={{
                  label: t("documentEditor.customerLabel"),
                  placeholder: t("documentEditor.customerPlaceholder"),
                  searchPlaceholder: t("documentEditor.customerSearchPlaceholder"),
                  emptyMessage: t("documentEditor.customerEmpty"),
                }}
              />

              {docKind === "quotation" ? (
                <>
                  <VatModeCalcToggle vatMode={vatMode} onVatModeChange={setVatMode} vatCalc={vatCalc} onVatCalcChange={setVatCalc} />
                  <FormField label={t("documentEditor.validUntilLabel")}>
                    <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label={t("documentEditor.dueDateLabel")}>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </FormField>
                  <FormField label={t("documentEditor.creditTermsLabel")}>
                    <Input type="number" min="0" value={creditTermsDays} onChange={(e) => setCreditTermsDays(e.target.value)} className="w-32" />
                  </FormField>
                  <WhtNetToReceivePanel
                    subtotal={totals.subtotal}
                    vatAmount={totals.vat_amount}
                    grandTotal={totals.grand_total}
                    whtRate={whtRate}
                    onWhtRateChange={setWhtRate}
                  />
                </>
              )}

              <DocumentLineEditor
                lines={lines}
                onLinesChange={setLines}
                itemOptions={itemOptions}
                itemLoading={itemsQuery.isLoading}
              />
            </>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-caption text-text-muted">{t("documentEditor.customerLabel")}</dt>
                  <dd className="text-text-primary">{previewCustomer?.name ?? customerIdFallback ?? "—"}</dd>
                </div>
                {record?.kind === "quotation" && (
                  <div>
                    <dt className="text-caption text-text-muted">{t("documentEditor.validUntilLabel")}</dt>
                    <dd className="text-text-primary">
                      {record.quotation.valid_until ? dateFormat.format(new Date(record.quotation.valid_until)) : "—"}
                    </dd>
                  </div>
                )}
                {record?.kind === "invoice" && (
                  <div>
                    <dt className="text-caption text-text-muted">{t("documentEditor.dueDateLabel")}</dt>
                    <dd className="text-text-primary">{record.invoice.due_date ? dateFormat.format(new Date(record.invoice.due_date)) : "—"}</dd>
                  </div>
                )}
              </dl>

              {record?.kind === "invoice" && invoiceIssued && (
                <PromptPayQrBlock
                  qr={promptPayQr.data?.body ?? null}
                  loading={promptPayQr.isLoading}
                  amount={record.invoice.grand_total}
                  labels={{
                    title: t("documentEditor.promptPayTitle"),
                    scanHint: t("documentEditor.promptPayScanHint"),
                    refLabel: t("documentEditor.promptPayRef"),
                    empty: t("documentEditor.promptPayEmpty"),
                  }}
                />
              )}

              {record?.kind === "quotation" && record.quotation.status === QuotationStatus.EXPIRED && (
                <p className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger-on">
                  {t("documentEditor.expiredHint")}
                </p>
              )}
            </>
          )}

          <div className="sticky bottom-0 -mx-5 -mb-5 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg-surface px-5 py-3">
            {isNew && (
              <Button onClick={() => void handleCreate()} disabled={!canSubmit} loading={createQuotation.isPending || createInvoice.isPending}>
                {docKind === "quotation" ? t("documentEditor.createQuotation") : t("documentEditor.createInvoice")}
              </Button>
            )}
            {record?.kind === "quotation" && record.quotation.status === QuotationStatus.DRAFT && (
              <PermissionButton required="sales.quotation.manage" onClick={() => void handleSend()} loading={sendQuotation.isPending}>
                {t("documentEditor.send")}
              </PermissionButton>
            )}
            {record?.kind === "quotation" && record.quotation.status === QuotationStatus.SENT && (
              <>
                <Button variant="secondary" onClick={() => void handleReject()} loading={rejectQuotation.isPending}>
                  {t("documentEditor.reject")}
                </Button>
                <PermissionButton required="sales.quotation.manage" onClick={() => void handleApprove()} loading={approveQuotation.isPending}>
                  {t("documentEditor.approve")}
                </PermissionButton>
              </>
            )}
            {record?.kind === "quotation" && record.quotation.status === QuotationStatus.APPROVED && (
              <PermissionButton required="sales.invoice.create" onClick={() => void handleConvert()} loading={convertQuotation.isPending}>
                {t("documentEditor.convertToInvoice")}
              </PermissionButton>
            )}
            {record?.kind === "invoice" && record.invoice.status === InvoiceStatus.DRAFT && (
              <PermissionButton required="sales.invoice.create" onClick={() => void handleIssue()} loading={issueInvoice.isPending}>
                {t("documentEditor.issue")}
              </PermissionButton>
            )}
            {record?.kind === "invoice" && invoiceIssued && (
              <Button variant="secondary" asChild>
                <Link to={SALES_PAYMENTS_PATH}>{t("documentEditor.goToPayments")}</Link>
              </Button>
            )}
          </div>
        </div>

        <PaperPreview
          docTypeLabel={docKind === "quotation" ? t("documentEditor.docTypeQuotation") : t("documentEditor.docTypeInvoice")}
          docNo={docNo}
          date={previewDate}
          customer={
            previewCustomer
              ? {
                  name: previewCustomer.name,
                  taxId: previewCustomer.tax_id,
                  branchCode: previewCustomer.branch_code,
                  address: previewCustomer.addresses.find((a) => a.is_default)?.line1 ?? previewCustomer.addresses[0]?.line1,
                }
              : undefined
          }
          lines={previewLines}
          totals={{ subtotal: totals.subtotal, vatAmount: totals.vat_amount, grandTotal: totals.grand_total, whtAmount: totals.wht_amount }}
          labels={{
            billTo: t("documentEditor.billTo"),
            docNoLabel: t("documentEditor.docNoLabel"),
            dateLabel: t("documentEditor.dateLabel"),
            subtotalLabel: t("documentEditor.subtotalLabel"),
            vatLabel: t("documentEditor.vatLabel"),
            whtLabel: t("documentEditor.whtLabel"),
            netToReceiveLabel: t("documentEditor.netToReceiveLabel"),
            grandTotalLabel: t("documentEditor.grandTotalLabel"),
          }}
        />
      </div>
    </div>
  );
}

export function DocumentEditPage() {
  const { id } = useParams({ from: "/sales/documents/$id/edit" });
  return <DocumentEditorScreen key={id} id={id} />;
}

export function DocumentViewPage() {
  const { id } = useParams({ from: "/sales/documents/$id" });
  return <DocumentEditorScreen key={id} id={id} />;
}
