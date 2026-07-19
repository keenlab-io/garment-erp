import { useQueryClient } from "@tanstack/react-query";
import type {
  DeadStockQuery,
  ItemsQuery,
  StockCardQuery,
  ValuationQuery,
} from "@erp/contracts";
import { api } from "../api/client.js";

/** Shape of the contract's shared `paginationQuery` (no exported type — `receipts`/`issues` reuse it as-is). */
type PaginationQuery = { limit: number; cursor?: string };

/**
 * Query keys for the `inventory` domain (M3 §2.1). One place so a mutation's invalidation and a
 * query's key can never drift apart. The contract has no per-id GET for items/receipts/issues/
 * counts/adjustments (list + action endpoints only) and no `lots`/SKU-list endpoints yet — hooks
 * below cover exactly the surface `inventoryContract` exposes; screens read detail off the list
 * page they navigated from until the contract grows those reads.
 */
export const inventoryKeys = {
  all: ["inventory"] as const,
  itemsAll: () => [...inventoryKeys.all, "items"] as const,
  items: (query: Partial<ItemsQuery> = {}) => [...inventoryKeys.itemsAll(), query] as const,
  goodsReceiptsAll: () => [...inventoryKeys.all, "goods-receipts"] as const,
  goodsReceipts: (query: Partial<PaginationQuery> = {}) =>
    [...inventoryKeys.goodsReceiptsAll(), query] as const,
  goodsIssuesAll: () => [...inventoryKeys.all, "goods-issues"] as const,
  goodsIssues: (query: Partial<PaginationQuery> = {}) =>
    [...inventoryKeys.goodsIssuesAll(), query] as const,
  reportsAll: () => [...inventoryKeys.all, "reports"] as const,
  stockCardReport: (query: StockCardQuery) =>
    [...inventoryKeys.reportsAll(), "stock-card", query] as const,
  valuationReport: (query: Partial<ValuationQuery> = {}) =>
    [...inventoryKeys.reportsAll(), "valuation", query] as const,
  lowStockReport: () => [...inventoryKeys.reportsAll(), "low-stock"] as const,
  deadStockReport: (query: Partial<DeadStockQuery> = {}) =>
    [...inventoryKeys.reportsAll(), "dead-stock", query] as const,
};

// ── Item catalog ──────────────────────────────────────────────────────────────

export function useItemsQuery(query: Partial<ItemsQuery> = {}) {
  return api.inventory.listItems.useQuery(inventoryKeys.items(query), { query });
}

export function useCreateItemMutation() {
  const queryClient = useQueryClient();
  return api.inventory.createItem.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.itemsAll() });
    },
  });
}

export function useCreateSkuMutation() {
  const queryClient = useQueryClient();
  return api.inventory.createSku.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.itemsAll() });
    },
  });
}

export function useCreateUomConversionMutation() {
  const queryClient = useQueryClient();
  return api.inventory.createUomConversion.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.itemsAll() });
    },
  });
}

/**
 * `printBarcodes` answers 202 `{ job_id }` with no companion status endpoint (unlike reporting's
 * `GET /exports/{job_id}`) — design D9 models label printing as fire-and-forget, same gap as
 * `useExportPnd1Mutation`/`useExportSsoMutation` (`hr/queries.ts`). The job-toast (FD7) announces
 * the job started; wire polling once the contract grows a matching status endpoint for label jobs.
 */
export function usePrintBarcodesMutation() {
  return api.inventory.printBarcodes.useMutation();
}

// ── Goods receipts ────────────────────────────────────────────────────────────

export function useGoodsReceiptsQuery(query: Partial<PaginationQuery> = {}) {
  return api.inventory.listGoodsReceipts.useQuery(inventoryKeys.goodsReceipts(query), { query });
}

export function useCreateGoodsReceiptMutation() {
  const queryClient = useQueryClient();
  return api.inventory.createGoodsReceipt.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.goodsReceiptsAll() });
    },
  });
}

export function useConfirmGoodsReceiptMutation() {
  const queryClient = useQueryClient();
  return api.inventory.confirmGoodsReceipt.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.goodsReceiptsAll() });
    },
  });
}

export function usePostGoodsReceiptMutation() {
  const queryClient = useQueryClient();
  return api.inventory.postGoodsReceipt.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.goodsReceiptsAll() });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.reportsAll() });
    },
  });
}

// ── Goods issues ──────────────────────────────────────────────────────────────

export function useGoodsIssuesQuery(query: Partial<PaginationQuery> = {}) {
  return api.inventory.listGoodsIssues.useQuery(inventoryKeys.goodsIssues(query), { query });
}

export function useCreateGoodsIssueMutation() {
  const queryClient = useQueryClient();
  return api.inventory.createGoodsIssue.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.goodsIssuesAll() });
    },
  });
}

/** Posting an issue can 422 "insufficient stock" (design MD2) — callers read that off `error`. */
export function usePostGoodsIssueMutation() {
  const queryClient = useQueryClient();
  return api.inventory.postGoodsIssue.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.goodsIssuesAll() });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.reportsAll() });
    },
  });
}

// ── Bills of materials ────────────────────────────────────────────────────────

export function useCreateBomMutation() {
  const queryClient = useQueryClient();
  return api.inventory.createBom.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.itemsAll() });
    },
  });
}

/** Read-only roll-up (writes no ledger rows) — modelled as a mutation since it's POST-triggered. */
export function useRollupBomMutation() {
  return api.inventory.rollupBom.useMutation();
}

// ── Stock counts ──────────────────────────────────────────────────────────────

export function useCreateStockCountMutation() {
  return api.inventory.createStockCount.useMutation();
}

export function useSetStockCountLinesMutation() {
  return api.inventory.setStockCountLines.useMutation();
}

/** Reconciling a count yields a DRAFT adjustment (design MD4) for the caller to route into. */
export function useReconcileStockCountMutation() {
  return api.inventory.reconcileStockCount.useMutation();
}

// ── Stock adjustments ─────────────────────────────────────────────────────────

export function useCreateStockAdjustmentMutation() {
  return api.inventory.createStockAdjustment.useMutation();
}

export function useApproveStockAdjustmentMutation() {
  return api.inventory.approveStockAdjustment.useMutation();
}

export function usePostStockAdjustmentMutation() {
  const queryClient = useQueryClient();
  return api.inventory.postStockAdjustment.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.reportsAll() });
    },
  });
}

// ── Reports ───────────────────────────────────────────────────────────────────
// Cost/valuation figures are omitted server-side without `inventory.cost.view` (design MD1/FD5);
// screens render `MaskedValue` — the query hooks themselves stay gating-agnostic.

/** `enabled` lets a screen defer the fetch until the operator has picked an item (M3 §4.1/§4.5) —
 * `item_id` is required, so firing the request with an unpicked/empty id would be a wasted 400. */
export function useStockCardReportQuery(query: StockCardQuery, options: { enabled?: boolean } = {}) {
  const queryKey = inventoryKeys.stockCardReport(query);
  return api.inventory.stockCardReport.useQuery(queryKey, { query }, { queryKey, enabled: options.enabled ?? true });
}

export function useValuationReportQuery(query: Partial<ValuationQuery> = {}) {
  return api.inventory.valuationReport.useQuery(inventoryKeys.valuationReport(query), { query });
}

export function useLowStockReportQuery() {
  return api.inventory.lowStockReport.useQuery(inventoryKeys.lowStockReport());
}

export function useDeadStockReportQuery(query: Partial<DeadStockQuery> = {}) {
  return api.inventory.deadStockReport.useQuery(inventoryKeys.deadStockReport(query), { query });
}
