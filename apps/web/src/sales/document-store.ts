import * as React from "react";
import { QuotationStatus, type Customer, type Invoice, type Quotation, type ReceiptTaxInvoice } from "@erp/contracts";

/**
 * The `sales` contract has no `listQuotations`/`listInvoices`/get-by-id endpoints (design D10 —
 * only create + lifecycle-transition mutations exist server-side); `sales/queries.ts` already
 * documents that gap: "screens read a document's state off whichever mutation response last
 * produced/touched it". This module is that shared read model — a plain module-level store (same
 * pattern as `api/token-store.ts`, not React state, so it survives navigation between the M5 §4
 * screens) keyed by document id, fed by every quotation/invoice mutation's response. It is
 * session-only (cleared on reload), the same scope `StockAdjustmentsPage` documents for its own
 * contract gap — a future `sales` contract read endpoint replaces this outright.
 *
 * `customer` denormalizes the `Customer` the creating screen had on hand (from
 * `CustomerAutocomplete`) — there is no `getCustomer`-by-id either, so this is the only way a
 * later screen (payments, the read-only document view) can show the customer's name/tax fields
 * without re-searching for them.
 */
export type SalesDocumentRecord =
  | { kind: "quotation"; quotation: Quotation; customer: Customer | null; updatedAt: string }
  | {
      kind: "invoice";
      invoice: Invoice;
      receipt: ReceiptTaxInvoice | null;
      customer: Customer | null;
      updatedAt: string;
    };

const records = new Map<string, SalesDocumentRecord>();
const listeners = new Set<() => void>();

// `useSyncExternalStore` requires `getSnapshot` to return a stable reference when nothing changed
// (it compares via `Object.is` on every render) — cache the array and only rebuild it on `emit()`.
let snapshot: SalesDocumentRecord[] = [];

function emit(): void {
  snapshot = Array.from(records.values());
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SalesDocumentRecord[] {
  return snapshot;
}

export function upsertQuotation(quotation: Quotation, customer?: Customer | null): void {
  const existing = records.get(quotation.id);
  const priorCustomer = existing?.customer ?? null;
  records.set(quotation.id, {
    kind: "quotation",
    quotation,
    customer: customer !== undefined ? customer : priorCustomer,
    updatedAt: new Date().toISOString(),
  });
  emit();
}

/** `receipt`/`customer` are only present on the call that first learns them — pass `undefined` to
 * leave whatever this invoice already has on record. */
export function upsertInvoice(invoice: Invoice, receipt?: ReceiptTaxInvoice | null, customer?: Customer | null): void {
  const existing = records.get(invoice.id);
  const priorReceipt = existing?.kind === "invoice" ? existing.receipt : null;
  const priorCustomer = existing?.customer ?? null;
  records.set(invoice.id, {
    kind: "invoice",
    invoice,
    receipt: receipt !== undefined ? receipt : priorReceipt,
    customer: customer !== undefined ? customer : priorCustomer,
    updatedAt: new Date().toISOString(),
  });
  emit();
}

export function getDocument(id: string): SalesDocumentRecord | undefined {
  return records.get(id);
}

/** All quotations/invoices touched this session, newest first. */
export function useSalesDocuments(): SalesDocumentRecord[] {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(
    () => [...snapshot].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [snapshot],
  );
}

export function useSalesDocument(id: string | undefined): SalesDocumentRecord | undefined {
  return React.useSyncExternalStore(
    subscribe,
    () => (id ? records.get(id) : undefined),
    () => (id ? records.get(id) : undefined),
  );
}

/** Test-only reset — the store is module-level and otherwise leaks between test files. */
export function __resetSalesDocumentStoreForTests(): void {
  records.clear();
  emit();
}

/** A quotation whose `valid_until` has passed but the server hasn't (yet) swept it to EXPIRED —
 * the worklist's "duplicate to renew" affordance (design MD4) needs to recognize this client-side
 * since there is no polling read to pick up the sweep. */
export function isQuotationExpired(quotation: Quotation, asOf: Date = new Date()): boolean {
  if (!quotation.valid_until) return false;
  if (quotation.status !== QuotationStatus.DRAFT && quotation.status !== QuotationStatus.SENT) return false;
  return new Date(`${quotation.valid_until}T23:59:59`) < asOf;
}
