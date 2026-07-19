import { useQueryClient } from "@tanstack/react-query";
import type { WorkOrderTimelineQuery } from "@erp/contracts";
import { api } from "../api/client.js";

/** Shape of the contract's shared `paginationQuery` (no exported type — mirrors `inventory/queries.ts`). */
type PaginationQuery = { limit: number; cursor?: string };

/**
 * Query keys for the `production` domain (M4 §2.1). One place so a mutation's invalidation and
 * a query's key can never drift apart. `workOrder`/`timeline` both nest under `workOrdersAll` so
 * a broad invalidation (scan/hold/defect/subcontract mutations, whose responses don't always
 * carry a `wo_id` to scope to — e.g. `recordDefect` only returns the defect) refreshes both the
 * Gantt feed and any open work-order detail in one call.
 */
export const productionKeys = {
  all: ["production"] as const,
  routingTemplatesAll: () => [...productionKeys.all, "routing-templates"] as const,
  routingTemplates: (query: Partial<PaginationQuery> = {}) =>
    [...productionKeys.routingTemplatesAll(), query] as const,
  workOrdersAll: () => [...productionKeys.all, "work-orders"] as const,
  workOrder: (id: string) => [...productionKeys.workOrdersAll(), id] as const,
  timelineAll: () => [...productionKeys.workOrdersAll(), "timeline"] as const,
  timeline: (query: Partial<WorkOrderTimelineQuery> = {}) =>
    [...productionKeys.timelineAll(), query] as const,
  reportsAll: () => [...productionKeys.all, "reports"] as const,
  wipReport: () => [...productionKeys.reportsAll(), "wip"] as const,
};

// ── Routing templates ─────────────────────────────────────────────────────────

export function useRoutingTemplatesQuery(query: Partial<PaginationQuery> = {}) {
  return api.production.listRoutingTemplates.useQuery(productionKeys.routingTemplates(query), {
    query,
  });
}

export function useCreateRoutingTemplateMutation() {
  const queryClient = useQueryClient();
  return api.production.createRoutingTemplate.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.routingTemplatesAll() });
    },
  });
}

// ── Work orders ───────────────────────────────────────────────────────────────

export function useWorkOrderQuery(id: string) {
  return api.production.getWorkOrder.useQuery(productionKeys.workOrder(id), { params: { id } });
}

export function useWorkOrderTimelineQuery(query: Partial<WorkOrderTimelineQuery> = {}) {
  return api.production.workOrderTimeline.useQuery(productionKeys.timeline(query), { query });
}

export function useCreateWorkOrderMutation() {
  const queryClient = useQueryClient();
  return api.production.createWorkOrder.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.workOrdersAll() });
    },
  });
}

// ── Shop-floor scanning ───────────────────────────────────────────────────────
// Realtime (`production/realtime.ts`) already patches the timeline/detail caches the instant a
// scan broadcasts, so these invalidations are a safety net for a missed/late socket event —
// invalidate the whole work-orders + WIP domain rather than trying to scope to one `wo_id`,
// since `recordDefect`/`subcontractWoStep` responses don't carry one (only a step/defect id).

export function useScanWoStepMutation() {
  const queryClient = useQueryClient();
  return api.production.scanWoStep.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.workOrdersAll() });
      void queryClient.invalidateQueries({ queryKey: productionKeys.wipReport() });
    },
  });
}

export function useHoldWoStepMutation() {
  const queryClient = useQueryClient();
  return api.production.holdWoStep.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.workOrdersAll() });
      void queryClient.invalidateQueries({ queryKey: productionKeys.wipReport() });
    },
  });
}

export function useRecordDefectMutation() {
  const queryClient = useQueryClient();
  return api.production.recordDefect.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.workOrdersAll() });
    },
  });
}

// ── Subcontracting ────────────────────────────────────────────────────────────

export function useSubcontractWoStepMutation() {
  const queryClient = useQueryClient();
  return api.production.subcontractWoStep.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.workOrdersAll() });
      void queryClient.invalidateQueries({ queryKey: productionKeys.wipReport() });
    },
  });
}

export function useReceiveSubcontractMutation() {
  const queryClient = useQueryClient();
  return api.production.receiveSubcontract.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productionKeys.workOrdersAll() });
      void queryClient.invalidateQueries({ queryKey: productionKeys.wipReport() });
    },
  });
}

// ── Reports ───────────────────────────────────────────────────────────────────

export function useWipReportQuery() {
  return api.production.wipReport.useQuery(productionKeys.wipReport());
}
