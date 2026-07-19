import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { InvoiceStatus, QuotationStatus } from "@erp/contracts";
import {
  Button,
  DataTable,
  InkChip,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  moneyColumn,
  textColumn,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import { AGING_BUCKET_LABEL_KEY } from "../../../sales/aging-labels.js";
import { AgingBucketChip, resolveAgingBucket } from "../../../sales/components/aging-bucket-chip.js";
import { docLifecycleToChip, type DocLifecycleStatus } from "../../../sales/components/doc-lifecycle-chip.js";
import { isQuotationExpired, upsertQuotation, useSalesDocuments } from "../../../sales/document-store.js";
import { DOC_LIFECYCLE_LABEL_KEY } from "../../../sales/doc-lifecycle-labels.js";
import { useCreateQuotationMutation, useExportInvoiceMutation } from "../../../sales/queries.js";

type WorklistType = "quotation" | "invoice";
type WorklistTypeFilter = WorklistType | "ALL";

interface WorklistRow {
  id: string;
  type: WorklistType;
  docNo: string;
  customerName: string;
  status: DocLifecycleStatus;
  grandTotal: string;
  relevantDate: string | null;
  daysOverdue: number;
  overdue: boolean;
  expired: boolean;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * The unified documents worklist (M5 §4.2, design MD4). The `sales` contract has no
 * `listQuotations`/`listInvoices` endpoint (`document-store.ts`'s header comment) — this reads
 * every quotation/invoice touched this session from that store rather than a server list, the same
 * gap `StockAdjustmentsPage` documents for its own module. Bulk export and "send reminder" act on
 * invoices only (the contract's `exportInvoice` has no quotation counterpart, and there is no
 * reminder endpoint at all — reminder is a client-side acknowledgement, not a server call).
 */
export function DocumentsListPage() {
  const { t } = useTranslation("sales");
  const { toast, jobToast } = useToast();
  const navigate = useNavigate();
  const { density } = useDensity();
  const dateFormat = useDateFormat({ dateStyle: "medium" });

  const documents = useSalesDocuments();
  const exportInvoice = useExportInvoiceMutation();
  const duplicateQuotation = useCreateQuotationMutation();

  const [typeFilter, setTypeFilter] = React.useState<WorklistTypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<DocLifecycleStatus | "ALL">("ALL");
  const [customerFilter, setCustomerFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");

  const today = React.useMemo(() => new Date(), []);

  const rows = React.useMemo<WorklistRow[]>(() => {
    return documents.map((record) => {
      if (record.kind === "quotation") {
        const q = record.quotation;
        const expired = isQuotationExpired(q, today);
        return {
          id: q.id,
          type: "quotation",
          docNo: q.doc_no,
          customerName: record.customer?.name ?? q.customer_id,
          status: expired ? QuotationStatus.EXPIRED : q.status,
          grandTotal: q.grand_total,
          relevantDate: q.valid_until,
          daysOverdue: 0,
          overdue: false,
          expired,
        };
      }
      const inv = record.invoice;
      const daysOverdue = inv.due_date ? daysBetween(new Date(inv.due_date), today) : 0;
      const overdue = inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.VOID && daysOverdue > 0;
      return {
        id: inv.id,
        type: "invoice",
        docNo: inv.doc_no,
        customerName: record.customer?.name ?? inv.customer_id,
        status: overdue ? InvoiceStatus.OVERDUE : inv.status,
        grandTotal: inv.grand_total,
        relevantDate: inv.due_date,
        daysOverdue: Math.max(daysOverdue, 0),
        overdue,
        expired: false,
      };
    });
  }, [documents, today]);

  const statusOptions = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.status))),
    [rows],
  );

  const filteredRows = rows.filter((row) => {
    if (typeFilter !== "ALL" && row.type !== typeFilter) return false;
    if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
    if (customerFilter && !row.customerName.toLowerCase().includes(customerFilter.toLowerCase())) return false;
    if (dateFrom && (!row.relevantDate || row.relevantDate < dateFrom)) return false;
    return true;
  });

  function handleReminder(row: WorklistRow) {
    // No reminder endpoint exists on the `sales` contract — this acknowledges the action locally
    // (design MD4 "offers a send-reminder action") until the contract grows one.
    toast({ tone: "success", title: t("worklist.reminderSent", { docNo: row.docNo }) });
  }

  async function handleDuplicate(row: WorklistRow) {
    const record = documents.find((d) => d.kind === "quotation" && d.quotation.id === row.id);
    if (record?.kind !== "quotation") return;
    const source = record.quotation;
    const result = await duplicateQuotation.mutateAsync({
      body: {
        customer_id: source.customer_id,
        vat_mode: source.vat_mode,
        vat_calc: source.vat_calc,
        lines: source.lines.map((l) => ({ item_id: l.item_id ?? undefined, description: l.description, qty: l.qty, unit_price: l.unit_price, discount: l.discount || undefined })),
      },
    });
    upsertQuotation(result.body.quotation, record.customer);
    toast({ tone: "success", title: t("worklist.duplicated") });
    void navigate({ to: "/sales/documents/$id/edit", params: { id: result.body.quotation.id } });
  }

  async function handleBulkExport(selected: WorklistRow[]) {
    const invoices = selected.filter((row) => row.type === "invoice");
    if (invoices.length === 0) return;
    const handle = jobToast({ title: t("worklist.exportPending", { count: invoices.length }) });
    try {
      await Promise.all(invoices.map((row) => exportInvoice.mutateAsync({ id: row.id, format: "pdf" })));
      handle.resolve({ tone: "success", title: t("worklist.exportStarted", { count: invoices.length }) });
    } catch {
      handle.resolve({ tone: "danger", title: t("worklist.exportFailed") });
    }
  }

  const columns = React.useMemo<ColumnDef<WorklistRow>[]>(
    () => [
      textColumn<WorklistRow>("docNo", { header: t("worklist.columnDocNo"), mono: true }),
      textColumn<WorklistRow>("customerName", { header: t("worklist.columnCustomer") }),
      {
        id: "status",
        header: t("worklist.columnStatus"),
        cell: ({ row }) => (
          <InkChip status={docLifecycleToChip(row.original.status)} label={t(DOC_LIFECYCLE_LABEL_KEY[row.original.status])} />
        ),
      },
      {
        id: "aging",
        header: t("worklist.columnAging"),
        meta: { secondary: true },
        cell: ({ row }) =>
          row.original.type === "invoice" && row.original.relevantDate ? (
            <AgingBucketChip
              daysOverdue={row.original.daysOverdue}
              label={t(AGING_BUCKET_LABEL_KEY[resolveAgingBucket(row.original.daysOverdue)])}
            />
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      moneyColumn<WorklistRow>("grandTotal", { header: t("worklist.columnGrandTotal") }),
      {
        id: "relevantDate",
        header: t("worklist.columnDate"),
        meta: { secondary: true },
        cell: ({ row }) => (row.original.relevantDate ? dateFormat.format(new Date(row.original.relevantDate)) : "—"),
      },
    ],
    [t, dateFormat],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("worklist.title")}</h1>
        <Button onClick={() => void navigate({ to: "/sales/documents/$id/edit", params: { id: "new" } })}>
          {t("worklist.newDocument")}
        </Button>
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        getRowId={(row) => row.id}
        tableId="sales-documents-worklist"
        density={density}
        emptyState={{ title: t("worklist.empty") }}
        enableSelection
        bulkActions={[{ key: "export", label: t("worklist.bulkExport"), onClick: (selected) => void handleBulkExport(selected) }]}
        rowActions={(row) => [
          {
            key: "view",
            label: t("worklist.viewAction"),
            onClick: () => void navigate({ to: "/sales/documents/$id", params: { id: row.id } }),
          },
          ...(row.overdue ? [{ key: "reminder", label: t("worklist.reminderAction"), onClick: () => handleReminder(row) }] : []),
          ...(row.expired ? [{ key: "duplicate", label: t("worklist.duplicateAction"), onClick: () => void handleDuplicate(row) }] : []),
        ]}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-2" role="group" aria-label={t("worklist.filterType")}>
              {(["ALL", "quotation", "invoice"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  aria-pressed={typeFilter === type}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium",
                    typeFilter === type
                      ? "border-accent bg-accent-subtle text-accent-text"
                      : "border-border text-text-secondary hover:bg-bg-sunken",
                  )}
                >
                  {type === "ALL" ? t("worklist.filterAll") : type === "quotation" ? t("worklist.filterQuotations") : t("worklist.filterInvoices")}
                </button>
              ))}
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DocLifecycleStatus | "ALL")}>
              <SelectTrigger aria-label={t("worklist.filterStatusLabel")} className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("worklist.filterAll")}</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(DOC_LIFECYCLE_LABEL_KEY[status])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              placeholder={t("worklist.filterCustomerPlaceholder")}
              aria-label={t("worklist.filterCustomerPlaceholder")}
              className="max-w-48"
            />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label={t("worklist.filterDateLabel")}
              className="max-w-40"
            />
          </div>
        }
      />
    </div>
  );
}
