import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgingReportQuery, CustomersQuery, ExportFormat } from "@erp/contracts";
import { api } from "../api/client.js";

/**
 * Query keys for the `sales` domain (M5 §2.1). One place so a mutation's invalidation and a
 * query's key can never drift apart. The contract has no per-id GET/list for quotations or
 * invoices yet (create + lifecycle-transition mutations only — `QuotationService.detail`/
 * `InvoiceService.detail` exist server-side but aren't wired to a route) and no
 * `document_template` endpoints at all (backend design D10 explicitly defers that wiring past
 * this task) — hooks below cover exactly the surface `salesContract` exposes; screens read a
 * document's state off whichever mutation response last produced/touched it until the contract
 * grows those reads.
 */
export const salesKeys = {
  all: ["sales"] as const,
  customersAll: () => [...salesKeys.all, "customers"] as const,
  customers: (query: Partial<CustomersQuery> = {}) => [...salesKeys.customersAll(), query] as const,
  promptPayQr: (invoiceId: string) => [...salesKeys.all, "invoices", invoiceId, "promptpay-qr"] as const,
  agingReportAll: () => [...salesKeys.all, "reports", "aging"] as const,
  agingReport: (query: Partial<AgingReportQuery> = {}) => [...salesKeys.agingReportAll(), query] as const,
};

// ── Customers ─────────────────────────────────────────────────────────────────
// `search` (name/tax_id) drives the CustomerAutocomplete that fills tax fields (design MD3).

export function useCustomersQuery(query: Partial<CustomersQuery> = {}) {
  return api.sales.listCustomers.useQuery(salesKeys.customers(query), { query });
}

export function useCreateCustomerMutation() {
  const queryClient = useQueryClient();
  return api.sales.createCustomer.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salesKeys.customersAll() });
    },
  });
}

// ── Quotations (sales.quotation.manage) ─────────────────────────────────────
// No getQuotation/listQuotations in the contract — callers hold the quotation returned by
// whichever of these mutations last touched it (see key-block comment above).

export function useCreateQuotationMutation() {
  return api.sales.createQuotation.useMutation();
}

export function useSendQuotationMutation() {
  return api.sales.sendQuotation.useMutation();
}

export function useApproveQuotationMutation() {
  return api.sales.approveQuotation.useMutation();
}

export function useRejectQuotationMutation() {
  return api.sales.rejectQuotation.useMutation();
}

/** Yields the new invoice (sales.invoice.create) — feed it straight into the invoice editor
 * (design MD3 "convert to invoice is one click, pre-fills identically"). */
export function useConvertQuotationMutation() {
  return api.sales.convertQuotation.useMutation();
}

// ── Invoices (sales.invoice.create) ─────────────────────────────────────────

export function useCreateInvoiceMutation() {
  return api.sales.createInvoice.useMutation();
}

export function useIssueInvoiceMutation() {
  return api.sales.issueInvoice.useMutation();
}

/** Sets PAID/PARTIALLY_PAID; the response's `receipt` is non-null on the payment that clears the
 * invoice (design MD5) — no separate "list receipts" endpoint exists. */
export function useRecordPaymentMutation() {
  return api.sales.recordPayment.useMutation();
}

/** 409s when a receipt/tax-invoice already exists (design MD5) — callers surface that as the
 * guarded `ConfirmDialog`'s explanatory state, never a silent fail. */
export function useVoidInvoiceMutation() {
  return api.sales.voidInvoice.useMutation();
}

/** `enabled` lets a caller defer the fetch until the invoice id is known (e.g. after issue). */
export function useInvoicePromptPayQrQuery(id: string, options: { enabled?: boolean } = {}) {
  const queryKey = salesKeys.promptPayQr(id);
  return api.sales.getInvoicePromptPayQr.useQuery(
    queryKey,
    { params: { id } },
    { queryKey, enabled: (options.enabled ?? true) && Boolean(id) },
  );
}

/**
 * `exportInvoice`/`getInvoiceWhtCertificate` are modelled as `GET` routes in the contract (they
 * only take path/query params), so ts-rest gives them `query`/`useQuery`, not `useMutation` —
 * wrap the imperative `query()` fetch as a plain TanStack mutation, same shape as
 * `useExportPnd1Mutation`/`useExportSsoMutation` (`hr/queries.ts`). Both answer 202 `{ job_id }`
 * with no companion status endpoint (unlike reporting's `GET /exports/{job_id}`) — the job-toast
 * (FD7) announces the job started; wire polling once the contract grows a matching status
 * endpoint for sales export/e-Tax jobs.
 */
export function useExportInvoiceMutation() {
  return useMutation({
    mutationFn: async (params: { id: string; format: ExportFormat }) => {
      const response = await api.sales.exportInvoice.query({
        params: { id: params.id },
        query: { format: params.format },
      });
      if (response.status !== 202) throw response;
      return response.body;
    },
  });
}

/** Same job-status gap as `useExportInvoiceMutation` above (see its comment). */
export function useInvoiceWhtCertificateMutation() {
  return useMutation({
    mutationFn: async (params: { id: string }) => {
      const response = await api.sales.getInvoiceWhtCertificate.query({ params: { id: params.id } });
      if (response.status !== 202) throw response;
      return response.body;
    },
  });
}

// ── e-Tax ─────────────────────────────────────────────────────────────────────

/** `POST`, so this is a native ts-rest mutation — but the same job-status gap applies (non-
 * authoritative stub, no status endpoint yet; see `useExportInvoiceMutation`'s comment). */
export function useSubmitEtaxMutation() {
  return api.sales.submitEtax.useMutation();
}

// ── Reports ───────────────────────────────────────────────────────────────────

export function useAgingReportQuery(query: Partial<AgingReportQuery> = {}) {
  return api.sales.agingReport.useQuery(salesKeys.agingReport(query), { query });
}
